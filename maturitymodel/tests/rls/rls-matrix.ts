/**
 * Matriz de testes de RLS do MMA (QA-PLAN B4 / ROLES-REDESIGN §4).
 *
 * Roda a política de acesso do banco contra 4 identidades reais — admin global, AM
 * global, SM do squad A, member do squad B — e valida SELECT/INSERT/UPDATE por tabela,
 * mais a JORNADA DO CICLO nos dois sentidos (incluindo o AM devolvendo o pacote de
 * homologação para a sessão).
 *
 * Os casos centrais:
 *   · AM global VÊ todos os squads (era o bug: "não aparece pra mim que preciso homologar");
 *   · AM global NÃO reseta e NÃO exclui — só o admin;
 *   · SM só vê e roda os squads DELE;
 *   · a escalada SM→AM ficou ESTRUTURALMENTE impossível: 'am' não é valor válido em
 *     squad_members.role. Antes era uma policy que barrava; agora é o CHECK do banco.
 *
 * ⚠️ Destrutivo: cria e apaga squads/usuários de teste. NUNCA aponte para produção —
 * use um branch/preview do Supabase (supabase branches create) com service_role própria.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx tests/rls/rls-matrix.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
/** Espera que a operação seja NEGADA pela RLS (erro OU zero linhas afetadas). */
function denied(label: string, res: { error: unknown; data?: unknown }) {
  const blocked = !!res.error || (Array.isArray(res.data) && res.data.length === 0);
  check(`${label} — NEGADO`, blocked);
}
function allowed(label: string, res: { error: { message?: string } | null }) {
  check(`${label} — permitido`, !res.error, res.error?.message);
}

const TAG = `rlstest_${Date.now()}`;
async function makeUser(name: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `${TAG}_${name}@example.com`;
  const password = `pw_${TAG}_${name}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${name}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`signIn ${name}: ${signErr.message}`);
  return { id: data.user.id, email, client };
}

async function main() {
  console.log(`\nRLS matrix (${TAG}) → ${URL}\n`);

  // ── Setup (service_role, ignora RLS) ──────────────────────────────────────
  const { data: squadA } = await admin.from("teams").insert({ name: `${TAG}_A`, tower: "LM" }).select("id").single();
  const { data: squadB } = await admin.from("teams").insert({ name: `${TAG}_B`, tower: "LM" }).select("id").single();
  const A = squadA!.id as string;
  const B = squadB!.id as string;

  const adminU = await makeUser("admin");
  const amG = await makeUser("amGlobal");
  const smA = await makeUser("smA");
  const memberB = await makeUser("memberB");

  // Papéis GLOBAIS por e-mail. O AM NÃO é membro de nenhum squad — é justamente o
  // caso que estava quebrado: quem homologa não precisa pertencer ao squad.
  await admin.from("portal_roles").insert([
    { email: adminU.email, role: "admin", note: "teste RLS" },
    { email: amG.email, role: "am", note: "teste RLS" },
  ]);
  await admin.from("squad_members").insert([
    { team_id: A, user_id: smA.id, role: "sm" },
    { team_id: B, user_id: memberB.id, role: "member" },
  ]);

  const { data: cycleA } = await admin
    .from("assessment_cycles")
    .insert({ team_id: A, quarter: "2026Q3", status: "pre_session" })
    .select("id")
    .single();
  const cycle = cycleA!.id as string;

  try {
    // ── O modelo antigo não pode voltar ─────────────────────────────────────
    console.log("Modelo antigo removido:");
    const isAmGone = await smA.client.rpc("is_am", { t: A });
    check("is_am(uuid) não existe mais", !!isAmGone.error);
    denied(
      "role='am' é recusado pelo CHECK de squad_members (escalada SM→AM estrutural)",
      await admin.from("squad_members").insert({ team_id: A, user_id: smA.id, role: "am" }).select(),
    );

    // ── Escopo de leitura ───────────────────────────────────────────────────
    console.log("\nLeitura por escopo:");
    allowed("SM-A lê teams de A", await smA.client.from("teams").select("id").eq("id", A));
    denied("SM-A lê teams de B", await smA.client.from("teams").select("id").eq("id", B));
    denied("Member-B lê teams de A", await memberB.client.from("teams").select("id").eq("id", A));

    // O CASO DO RELATO: o AM enxerga squad em que não é membro.
    allowed("AM global lê teams de A (não é membro)", await amG.client.from("teams").select("id").eq("id", A));
    const amTeams = await amG.client.from("teams").select("id");
    const amIds = (amTeams.data ?? []).map((r: { id: string }) => r.id);
    check("AM global vê A e B", amIds.includes(A) && amIds.includes(B));
    const amCycles = await amG.client.from("assessment_cycles").select("id").eq("team_id", A);
    check("AM global lê o ciclo de A", (amCycles.data ?? []).length === 1);

    // ── Estrutura da organização: só admin ──────────────────────────────────
    console.log("\nEstrutura da organização (só admin):");
    denied(
      "SM-A adiciona membro no próprio squad",
      await smA.client.from("squad_members").insert({ team_id: A, user_id: memberB.id, role: "member" }).select(),
    );
    denied(
      "AM global adiciona membro em A",
      await amG.client.from("squad_members").insert({ team_id: A, user_id: memberB.id, role: "member" }).select(),
    );
    allowed(
      "Admin adiciona membro em A",
      await adminU.client.from("squad_members").insert({ team_id: A, user_id: memberB.id, role: "member" }).select(),
    );
    denied(
      "AM global renomeia squad A",
      await amG.client.from("teams").update({ name: `${TAG}_hack` }).eq("id", A).select(),
    );
    denied(
      "AM global concede papel global a si mesmo (admin)",
      await amG.client.from("portal_roles").insert({ email: amG.email, role: "admin" }).select(),
    );

    // ── Conteúdo do modelo: só admin ────────────────────────────────────────
    console.log("\nConteúdo do modelo:");
    denied("SM-A edita axes", await smA.client.from("axes").insert({ name: `${TAG}_axis` }).select());
    denied("AM global edita axes", await amG.client.from("axes").insert({ name: `${TAG}_axis_am` }).select());
    allowed("Admin edita axes", await adminU.client.from("axes").insert({ name: `${TAG}_axis_ok` }).select());

    // ── JORNADA: ida ────────────────────────────────────────────────────────
    console.log("\nJornada — ida:");
    denied(
      "SM-A pula pre_session → homologation (transição inválida)",
      await smA.client.from("assessment_cycles").update({ status: "homologation" }).eq("id", cycle).select(),
    );
    denied(
      "Member-B abre a sessão do squad A",
      await memberB.client.from("assessment_cycles").update({ status: "session" }).eq("id", cycle).select(),
    );
    allowed(
      "SM-A: pre_session → session",
      await smA.client.from("assessment_cycles").update({ status: "session" }).eq("id", cycle).select(),
    );
    allowed(
      "SM-A: session → homologation",
      await smA.client.from("assessment_cycles").update({ status: "homologation" }).eq("id", cycle).select(),
    );

    // ── JORNADA: a volta (o que o Diego pediu explicitamente) ───────────────
    console.log("\nJornada — a volta:");
    denied(
      "SM-A devolve homologation → session (é do AM)",
      await smA.client.from("assessment_cycles").update({ status: "session" }).eq("id", cycle).select(),
    );
    allowed(
      "AM global devolve homologation → session",
      await amG.client.from("assessment_cycles").update({ status: "session" }).eq("id", cycle).select(),
    );
    // E de volta para a fila, para seguir o teste.
    allowed(
      "SM-A reenvia session → homologation",
      await smA.client.from("assessment_cycles").update({ status: "homologation" }).eq("id", cycle).select(),
    );

    // ── Homologar e oficializar ─────────────────────────────────────────────
    console.log("\nHomologação e oficialização:");
    const { data: dims } = await admin.from("dimensions").select("id");
    const dimensions = (dims ?? []) as { id: string }[];
    check("o modelo tem dimensões para homologar", dimensions.length > 0, `${dimensions.length} dimensões`);

    denied(
      "SM-A grava homologação",
      await smA.client
        .from("homologations")
        .insert({ cycle_id: cycle, dimension_id: dimensions[0]!.id, official_stage: 2, am_user_id: smA.id })
        .select(),
    );
    allowed(
      "AM global grava homologação",
      await amG.client
        .from("homologations")
        .insert({ cycle_id: cycle, dimension_id: dimensions[0]!.id, official_stage: 2, am_user_id: amG.id })
        .select(),
    );

    // officialize_cycle exige TODAS as dimensões homologadas — semeia o resto.
    await admin.from("homologations").upsert(
      dimensions.map((d) => ({ cycle_id: cycle, dimension_id: d.id, official_stage: 2, am_user_id: amG.id })),
      { onConflict: "cycle_id,dimension_id" },
    );
    denied("SM-A officialize_cycle", await smA.client.rpc("officialize_cycle", { p_cycle: cycle }));
    allowed("AM global officialize_cycle", await amG.client.rpc("officialize_cycle", { p_cycle: cycle }));

    const { data: official } = await admin.from("assessment_cycles").select("status").eq("id", cycle).single();
    check("ciclo ficou 'official'", official?.status === "official");
    const { count: kaizenCount } = await admin
      .from("kaizens")
      .select("id", { count: "exact", head: true })
      .eq("cycle_id", cycle);
    // Regressão: a oficialização GERA os kaizens (a etapa "Plano" da jornada). Uma
    // reescrita do RPC já apagou esse insert por descuido.
    check("oficializar gerou kaizens", (kaizenCount ?? 0) > 0, `${kaizenCount} kaizens`);

    denied("chamar officialize_cycle de novo é recusado (não duplica kaizens)",
      await amG.client.rpc("officialize_cycle", { p_cycle: cycle }));

    console.log("\nArquivamento:");
    denied(
      "SM-A arquiva o ciclo oficial",
      await smA.client.from("assessment_cycles").update({ status: "archived" }).eq("id", cycle).select(),
    );
    allowed(
      "AM global arquiva o ciclo oficial",
      await amG.client.from("assessment_cycles").update({ status: "archived" }).eq("id", cycle).select(),
    );

    // ── Ações destrutivas: SÓ admin ─────────────────────────────────────────
    console.log("\nAções destrutivas (só admin):");
    denied("SM-A restart_assessment(A)", await smA.client.rpc("restart_assessment", { p_team: A }));
    denied("SM-A delete_squad(A)", await smA.client.rpc("delete_squad", { p_team: A }));
    // O ponto do pedido: "AM consegue homologar, mas não deletar nem resetar nada".
    denied("AM global restart_assessment(A)", await amG.client.rpc("restart_assessment", { p_team: A }));
    denied("AM global delete_squad(A)", await amG.client.rpc("delete_squad", { p_team: A }));
    allowed("Admin restart_assessment(A)", await adminU.client.rpc("restart_assessment", { p_team: A }));

    // O reset volta ao COMEÇO da jornada, não à sessão (defeito corrigido em 26/07:
    // desde 24/07 o ciclo nasce em pre_session, e resetar pulava a análise prévia).
    const { data: reset } = await admin.from("assessment_cycles").select("status").eq("id", cycle).single();
    check("restart_assessment volta para 'pre_session'", reset?.status === "pre_session", `veio '${reset?.status}'`);

    // ── my_portal_roles ────────────────────────────────────────────────────
    console.log("\nPapéis do portal:");
    const rolesAm = await amG.client.rpc("my_portal_roles");
    check("my_portal_roles do AM devolve ['am']", JSON.stringify(rolesAm.data) === JSON.stringify(["am"]));
    const rolesSm = await smA.client.rpc("my_portal_roles");
    check("my_portal_roles do SM devolve []", Array.isArray(rolesSm.data) && rolesSm.data.length === 0);
    const isAmAdmin = await adminU.client.rpc("is_portal_am");
    check("is_portal_am() é true para o admin", isAmAdmin.data === true);

    // ── Diretório de pessoas ────────────────────────────────────────────────
    console.log("\nDiretório de profiles:");
    const dir = await memberB.client.from("profiles").select("id");
    const ids = (dir.data ?? []).map((r: { id: string }) => r.id);
    check("Member-B não vê SM-A (outro squad)", !ids.includes(smA.id));
    denied("SM-A busca perfil por e-mail (agora é ação de admin)",
      await smA.client.rpc("find_profile_by_email", { p_email: memberB.email }));
    allowed("Admin busca perfil por e-mail",
      await adminU.client.rpc("find_profile_by_email", { p_email: memberB.email }));
  } finally {
    // ── Teardown ────────────────────────────────────────────────────────────
    console.log("\nLimpando…");
    await admin.from("portal_roles").delete().in("email", [adminU.email, amG.email]);
    await admin.from("kaizens").delete().in("team_id", [A, B]);
    await admin.from("homologations").delete().eq("cycle_id", cycle);
    await admin.from("assessment_cycles").delete().in("team_id", [A, B]);
    await admin.from("squad_members").delete().in("team_id", [A, B]);
    await admin.from("axes").delete().like("name", `${TAG}%`);
    await admin.from("teams").delete().in("id", [A, B]);
    for (const u of [adminU, amG, smA, memberB]) {
      await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
    }
  }

  console.log(`\n${passed} passaram, ${failed} falharam.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(2);
});
