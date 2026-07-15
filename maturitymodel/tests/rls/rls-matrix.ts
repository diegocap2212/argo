/**
 * Matriz de testes de RLS do MMA (QA-PLAN B4 / ROLES-REDESIGN §4).
 *
 * Roda a política de acesso do banco contra 4 identidades reais (admin global, SM do
 * squad A, membro do squad A, SM do squad B) e valida SELECT/INSERT/UPDATE por tabela.
 * O caso central é a REGRESSÃO da escalada de privilégio: um SM NÃO pode gravar uma
 * linha com role='am' (nem para si mesmo) — fix de 20260715150000.
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
function check(label: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}
/** Espera que a operação seja NEGADA pela RLS (erro OU zero linhas afetadas). */
function denied(label: string, res: { error: unknown; data: unknown }) {
  const blocked = !!res.error || (Array.isArray(res.data) && res.data.length === 0);
  check(`${label} — NEGADO`, blocked);
}
function allowed(label: string, res: { error: unknown }) {
  check(`${label} — permitido`, !res.error);
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
  const smA = await makeUser("smA");
  const memberA = await makeUser("memberA");
  const smB = await makeUser("smB");

  await admin.from("portal_admins").insert({ email: adminU.email, note: "teste RLS" });
  await admin.from("squad_members").insert([
    { team_id: A, user_id: smA.id, role: "sm" },
    { team_id: A, user_id: memberA.id, role: "team" },
    { team_id: B, user_id: smB.id, role: "sm" },
  ]);

  try {
    // ── Leitura escopada por squad ──────────────────────────────────────────
    console.log("Leitura por squad:");
    allowed("SM-A lê teams de A", await smA.client.from("teams").select("id").eq("id", A));
    denied("SM-A lê teams de B", await smA.client.from("teams").select("id").eq("id", B));

    // ── Gestão de membros do próprio squad ──────────────────────────────────
    console.log("\nGestão de membros:");
    allowed("SM-A adiciona membro (team) em A",
      await smA.client.from("squad_members").insert({ team_id: A, user_id: smB.id, role: "team" }));
    denied("SM-A adiciona membro em B",
      await smA.client.from("squad_members").insert({ team_id: B, user_id: memberA.id, role: "team" }));
    denied("Membro-A gerencia membros de A",
      await memberA.client.from("squad_members").insert({ team_id: A, user_id: smB.id, role: "team" }));

    // ── REGRESSÃO: escalada SM → AM (o fix central) ─────────────────────────
    console.log("\nEscalada de privilégio (regressão):");
    denied("SM-A se auto-promove a AM (insert role=am)",
      await smA.client.from("squad_members").insert({ team_id: A, user_id: smA.id, role: "am" }));
    denied("SM-A promove outro a AM em A",
      await smA.client.from("squad_members").insert({ team_id: A, user_id: memberA.id, role: "am" }));
    denied("SM-A muda o próprio papel para AM (update team→am)",
      await smA.client.from("squad_members").update({ role: "am" }).eq("team_id", A).eq("user_id", smA.id).select());
    allowed("Admin promove alguém a AM em A",
      await adminU.client.from("squad_members").insert({ team_id: A, user_id: memberA.id, role: "am" }));

    // ── Conteúdo do modelo: só admin ────────────────────────────────────────
    console.log("\nConteúdo do modelo:");
    denied("SM-A edita axes", await smA.client.from("axes").insert({ name: `${TAG}_axis` }).select());
    allowed("Admin edita axes", await adminU.client.from("axes").insert({ name: `${TAG}_axis_ok` }).select());

    // ── RPCs destrutivos: só admin ──────────────────────────────────────────
    console.log("\nRPCs destrutivos:");
    denied("SM-A restart_assessment(A)", await smA.client.rpc("restart_assessment", { p_team: A }));
    denied("SM-A delete_squad(A)", await smA.client.rpc("delete_squad", { p_team: A }));

    // ── Diretório de pessoas fechado ────────────────────────────────────────
    console.log("\nDiretório de profiles:");
    const dir = await memberA.client.from("profiles").select("id");
    // Membro-A só deve ver colegas de squad A + ele mesmo; nunca smB (squad B).
    const ids = (dir.data ?? []).map((r: { id: string }) => r.id);
    check("Membro-A não vê SM-B (outro squad)", !ids.includes(smB.id));
  } finally {
    // ── Teardown ────────────────────────────────────────────────────────────
    console.log("\nLimpando…");
    await admin.from("portal_admins").delete().eq("email", adminU.email);
    await admin.from("squad_members").delete().in("team_id", [A, B]);
    await admin.from("axes").delete().like("name", `${TAG}%`);
    await admin.from("teams").delete().in("id", [A, B]);
    for (const u of [adminU, smA, memberA, smB]) {
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
