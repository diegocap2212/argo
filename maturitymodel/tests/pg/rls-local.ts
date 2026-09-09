/**
 * Papéis e jornada do MMA exercitados de VERDADE, em Postgres (PGlite/WASM).
 * Sem Docker, sem nuvem, sem credencial — roda em qualquer máquina e no CI.
 *
 * Três coisas que nenhum outro teste do repo prova:
 *
 *   PARTE A — a MIGRAÇÃO DE DADOS. Semeia o modelo antigo (portal_admins + AM por squad +
 *     po/tl/team), aplica 20260726120000 e confere que **todo AM por squad virou AM
 *     global**. É o ensaio do passo que protege as pessoas: se a contagem não fechar,
 *     alguém que homologa hoje perde o acesso amanhã.
 *
 *   PARTE B — o freio de segurança. Um AM sem e-mail em `profiles` tem de ABORTAR a
 *     migration, não passar em silêncio.
 *
 *   PARTE C — a matriz de permissão e a jornada de ida e volta, com RLS real.
 *
 * `tests/rls/rls-matrix.ts` continua sendo a verificação canônica (Supabase de verdade,
 * com GoTrue). Este harness é o que dá para rodar ANTES de tocar em qualquer banco.
 *
 * Uso: pnpm -C maturitymodel test:rls-local
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  applyAllMigrations,
  migrationSql,
  PORTAL_ROLES_MIGRATION,
  RODADA_RBAC,
} from "./apply-migrations.ts";
import {
  asUser,
  createSupabaseLikeDb,
  grantSupabaseDefaults,
  makeUser,
  seedVaultSecret,
} from "./supabase-shim.ts";

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

/** Roda a operação como a identidade e diz se o banco PERMITIU. */
async function attempt(
  db: PGlite,
  identity: { sub?: string; email?: string },
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: boolean; rows: number; error?: string }> {
  try {
    return await asUser(db, identity, async () => {
      const res = await db.query(sql, params);
      return { ok: true, rows: res.rows.length };
    });
  } catch (e) {
    return { ok: false, rows: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Uma escrita é NEGADA quando dá erro OU quando a RLS filtrou tudo (0 linhas afetadas
 * com RETURNING). As duas formas contam — a segunda é a silenciosa e a mais perigosa.
 */
async function denied(
  db: PGlite,
  label: string,
  identity: { sub?: string; email?: string },
  sql: string,
  params: unknown[] = [],
) {
  const r = await attempt(db, identity, sql, params);
  check(`${label} — NEGADO`, !r.ok || r.rows === 0, r.ok ? `permitiu ${r.rows} linha(s)` : undefined);
}

async function allowed(
  db: PGlite,
  label: string,
  identity: { sub?: string; email?: string },
  sql: string,
  params: unknown[] = [],
) {
  const r = await attempt(db, identity, sql, params);
  check(`${label} — permitido`, r.ok && r.rows > 0, r.error ?? "0 linhas");
}

const U = {
  admin: "11111111-1111-1111-1111-111111111111",
  am: "22222222-2222-2222-2222-222222222222",
  smA: "33333333-3333-3333-3333-333333333333",
  memberB: "44444444-4444-4444-4444-444444444444",
  po: "55555555-5555-5555-5555-555555555555",
};
const E = {
  admin: "admin@lm.test",
  am: "am@lm.test",
  smA: "sma@lm.test",
  memberB: "memberb@lm.test",
  po: "po@lm.test",
};

// ════════════════════════════════════════════════════════════════════════════
// PARTE A — ensaio da migração de dados
// ════════════════════════════════════════════════════════════════════════════
async function partA(): Promise<PGlite> {
  console.log("\n── PARTE A · migração de dados (modelo antigo → papéis globais) ──\n");

  const db = await createSupabaseLikeDb();
  await applyAllMigrations(db, { stopBefore: PORTAL_ROLES_MIGRATION, grants: false });
  await grantSupabaseDefaults(db);

  // Estado do modelo ANTIGO, como está em produção hoje.
  const { rows: teams } = await db.query<{ id: string }>(
    `insert into teams (name, tower) values ('Salesforce Vendas','LM'), ('Squad B','LM') returning id`,
  );
  const [A, B] = teams.map((t) => t.id);

  await makeUser(db, U.admin, E.admin);
  await makeUser(db, U.am, E.am);
  await makeUser(db, U.smA, E.smA);
  await makeUser(db, U.memberB, E.memberB);
  await makeUser(db, U.po, E.po);

  await db.query(`insert into portal_admins (email, note) values ($1, 'admin de teste')`, [E.admin]);
  // O AM é membro do squad A com role='am' — o modelo que estamos deixando para trás.
  await db.query(
    `insert into squad_members (team_id, user_id, role) values
       ($1,$2,'am'), ($1,$3,'sm'), ($1,$4,'po'), ($5,$6,'team')`,
    [A, U.am, U.smA, U.po, B, U.memberB],
  );

  const before = await db.query<{ n: number }>(
    `select count(distinct user_id)::int as n from squad_members where role = 'am'`,
  );
  const amsBefore = before.rows[0]!.n;
  console.log(`  AMs por squad antes da migração: ${amsBefore}`);

  // ── A migração ──
  await db.exec(migrationSql(PORTAL_ROLES_MIGRATION));
  // E TUDO o que veio depois dela. Antes o harness parava aqui, então toda migration
  // posterior à de papéis (drop_is_any_am, autorização das âncoras) nunca era exercitada
  // pela PARTE C — o teste passava sem nunca ter visto o estado atual do banco.
  await applyAllMigrations(db, { startAfter: PORTAL_ROLES_MIGRATION, grants: false });
  await grantSupabaseDefaults(db);

  const after = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where role = 'am'`,
  );
  // ESTA é a asserção que protege as pessoas.
  check(
    `todo AM por squad virou AM global (${amsBefore} → ${after.rows[0]!.n})`,
    after.rows[0]!.n === amsBefore,
  );

  const amRow = await db.query<{ email: string }>(
    `select email from portal_roles where role = 'am'`,
  );
  check("o AM migrado é o e-mail certo", amRow.rows[0]?.email === E.am, amRow.rows[0]?.email);

  // `admin` → `admin_geral` em 20260731120000: quem era admin vira Admin Geral, para ninguém
  // perder poder na virada. O papel `admin` novo (operacional) nasce sem ninguém.
  const adminRow = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where role = 'admin_geral' and email = $1`,
    [E.admin],
  );
  check("portal_admins → portal_roles(admin_geral)", adminRow.rows[0]!.n === 1);

  const adminNovo = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where role = 'admin'`,
  );
  check("o papel Admin novo nasce SEM NINGUÉM", adminNovo.rows[0]!.n === 0, `${adminNovo.rows[0]!.n}`);

  // Colapso dos papéis: quem era AM/po/team segue MEMBRO do squad, agora como 'member'.
  const collapsed = await db.query<{ role: string; n: number }>(
    `select role, count(*)::int as n from squad_members group by role order by role`,
  );
  const byRole = Object.fromEntries(collapsed.rows.map((r) => [r.role, r.n]));
  check(
    "papéis de squad colapsaram em sm|member sem perder vínculo",
    byRole.sm === 1 && byRole.member === 3 && Object.keys(byRole).length === 2,
    JSON.stringify(byRole),
  );

  // O AM continua membro de A (o vínculo é real) — só a autoridade virou global.
  const stillMember = await db.query<{ n: number }>(
    `select count(*)::int as n from squad_members where user_id = $1 and team_id = $2`,
    [U.am, A],
  );
  check("o ex-AM-de-squad continua membro do squad", stillMember.rows[0]!.n === 1);

  (db as PGlite & { _A?: string; _B?: string })._A = A;
  (db as PGlite & { _A?: string; _B?: string })._B = B;
  return db;
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE B — o freio: AM sem e-mail tem de abortar
// ════════════════════════════════════════════════════════════════════════════
async function partB() {
  console.log("\n── PARTE B · freio de segurança (AM órfão aborta a migração) ──\n");

  const db = await createSupabaseLikeDb();
  await applyAllMigrations(db, { stopBefore: PORTAL_ROLES_MIGRATION });

  const { rows } = await db.query<{ id: string }>(
    `insert into teams (name, tower) values ('Órfão','LM') returning id`,
  );
  const team = rows[0]!.id;

  // Usuário em auth.users e em squad_members como AM, mas SEM e-mail em profiles —
  // exatamente o caso que faria a pessoa perder acesso em silêncio.
  // O insert em auth.users dispara o trigger `on_auth_user_created`, que cria o profile;
  // por isso o e-mail é apagado depois, em vez de inserido nulo.
  await db.query(`insert into auth.users (id, email) values ($1, 'orfao@lm.test')`, [U.am]);
  await db.query(`update profiles set email = null where id = $1`, [U.am]);
  await db.query(`insert into squad_members (team_id, user_id, role) values ($1,$2,'am')`, [team, U.am]);

  let aborted = false;
  let message = "";
  try {
    await db.exec(migrationSql(PORTAL_ROLES_MIGRATION));
  } catch (e) {
    aborted = true;
    message = e instanceof Error ? e.message : String(e);
  }
  check("a migration ABORTA com AM sem e-mail", aborted, "aplicou em silêncio!");
  check(
    "a mensagem de erro explica o que fazer",
    /ABORTADO/.test(message) && /perde acesso/.test(message),
    message.slice(0, 120),
  );

  // A migration abre `begin;` e o RAISE aborta a transação sem chegar ao `commit`.
  // Fechá-la é necessário para poder consultar o estado — e o próprio fato de a
  // transação ficar aberta é a prova de que nada foi confirmado.
  await db.exec("rollback");

  // E aborta ANTES de mexer em nada: a transação inteira desfaz.
  const survived = await db.query<{ n: number }>(
    `select count(*)::int as n from squad_members where role = 'am'`,
  );
  check("nada foi alterado (rollback da transação)", survived.rows[0]!.n === 1);
  await db.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE C — matriz de permissão + jornada, com RLS real
// ════════════════════════════════════════════════════════════════════════════
async function partC(db: PGlite) {
  const A = (db as PGlite & { _A?: string })._A!;
  const B = (db as PGlite & { _B?: string })._B!;
  const admin = { sub: U.admin, email: E.admin };
  const am = { sub: U.am, email: E.am };
  const sm = { sub: U.smA, email: E.smA };
  const member = { sub: U.memberB, email: E.memberB };

  console.log("\n── PARTE C · escopo de leitura ──\n");
  // O CASO DO RELATO: o AM não é mais dependente de vínculo de squad.
  const amSees = await asUser(db, am, async () =>
    (await db.query<{ id: string }>(`select id from teams`)).rows.map((r) => r.id),
  );
  check("AM global vê os DOIS squads", amSees.includes(A) && amSees.includes(B), `viu ${amSees.length}`);

  const smSees = await asUser(db, sm, async () =>
    (await db.query<{ id: string }>(`select id from teams`)).rows.map((r) => r.id),
  );
  check("SM do A vê só o A", smSees.length === 1 && smSees[0] === A, `viu ${smSees.length}`);

  const memberSees = await asUser(db, member, async () =>
    (await db.query<{ id: string }>(`select id from teams`)).rows.map((r) => r.id),
  );
  check("member do B vê só o B", memberSees.length === 1 && memberSees[0] === B);

  console.log("\n── PARTE C · papéis do portal ──\n");
  const amRoles = await asUser(db, am, async () =>
    (await db.query<{ my_portal_roles: string[] }>(`select my_portal_roles()`)).rows[0]!.my_portal_roles,
  );
  check("my_portal_roles() do AM = ['am']", JSON.stringify(amRoles) === JSON.stringify(["am"]), JSON.stringify(amRoles));

  const smRoles = await asUser(db, sm, async () =>
    (await db.query<{ my_portal_roles: string[] }>(`select my_portal_roles()`)).rows[0]!.my_portal_roles,
  );
  check("my_portal_roles() do SM = []", Array.isArray(smRoles) && smRoles.length === 0, JSON.stringify(smRoles));

  // "Admin Geral faz tudo" deixou de ser um `or is_portal_admin()` dentro de is_portal_am() e
  // passou a ser LINHA NA MATRIZ. A diferença importa: agora dá para ver e auditar, e a tela
  // de permissões não mente sobre o que ele pode.
  const adminHomologa = await asUser(db, admin, async () =>
    (await db.query<{ v: boolean }>(`select has_perm('mma.cycle.homologate', $1) as v`, [A]))
      .rows[0]!.v,
  );
  check("Admin Geral homologa (por matriz, não por atalho em código)", adminHomologa === true);

  const perms = await asUser(db, admin, async () =>
    (await db.query<{ my_permissions: string[] }>(`select my_permissions()`)).rows[0]!.my_permissions,
  );
  check(
    "my_permissions() do Admin Geral inclui governar acesso",
    perms.includes("neo.roles.manage") && perms.includes("neo.matrix.manage"),
    perms.join(","),
  );

  const permsAm = await asUser(db, am, async () =>
    (await db.query<{ my_permissions: string[] }>(`select my_permissions()`)).rows[0]!.my_permissions,
  );
  check(
    "AM NÃO governa acesso (é a divisão admin × admin_geral)",
    !permsAm.includes("neo.roles.manage") && !permsAm.includes("neo.matrix.manage"),
    permsAm.join(","),
  );

  console.log("\n── PARTE C · estrutura da organização (só admin) ──\n");
  await denied(db, "SM adiciona membro no próprio squad", sm,
    `insert into squad_members (team_id, user_id, role) values ($1,$2,'member') returning team_id`, [A, U.memberB]);
  await denied(db, "AM adiciona membro em A", am,
    `insert into squad_members (team_id, user_id, role) values ($1,$2,'member') returning team_id`, [A, U.memberB]);
  await denied(db, "AM renomeia o squad A", am,
    `update teams set name = 'invadido' where id = $1 returning id`, [A]);
  await denied(db, "AM concede admin a si mesmo", am,
    `insert into portal_roles (email, role) values ($1,'admin') returning email`, [E.am]);
  await allowed(db, "admin adiciona membro em A", admin,
    `insert into squad_members (team_id, user_id, role) values ($1,$2,'member') returning team_id`, [A, U.memberB]);

  console.log("\n── PARTE C · escalada SM→AM é estruturalmente impossível ──\n");
  await denied(db, "qualquer um grava role='am' em squad_members", admin,
    `insert into squad_members (team_id, user_id, role) values ($1,$2,'am') returning team_id`, [A, U.smA]);

  console.log("\n── PARTE C · conteúdo do modelo (só admin) ──\n");
  await denied(db, "SM edita axes", sm, `insert into axes (name) values ('x') returning name`);
  await denied(db, "AM edita axes", am, `insert into axes (name) values ('y') returning name`);

  console.log("\n── PARTE C · jornada: IDA ──\n");
  const { rows: cyc } = await db.query<{ id: string }>(
    `insert into assessment_cycles (team_id, quarter, status) values ($1,'2026Q3','pre_session') returning id`,
    [A],
  );
  const cycle = cyc[0]!.id;

  await denied(db, "SM pula pre_session → homologation", sm,
    `update assessment_cycles set status='homologation' where id=$1 returning id`, [cycle]);
  await denied(db, "member do B abre a sessão do A", member,
    `update assessment_cycles set status='session' where id=$1 returning id`, [cycle]);
  await allowed(db, "SM: pre_session → session", sm,
    `update assessment_cycles set status='session' where id=$1 returning id`, [cycle]);
  await allowed(db, "SM: session → homologation", sm,
    `update assessment_cycles set status='homologation' where id=$1 returning id`, [cycle]);

  console.log("\n── PARTE C · jornada: A VOLTA ──\n");
  await denied(db, "SM devolve homologation → session (é do AM)", sm,
    `update assessment_cycles set status='session' where id=$1 returning id`, [cycle]);
  await allowed(db, "AM devolve homologation → session", am,
    `update assessment_cycles set status='session' where id=$1 returning id`, [cycle]);
  await allowed(db, "SM reenvia session → homologation", sm,
    `update assessment_cycles set status='homologation' where id=$1 returning id`, [cycle]);

  console.log("\n── PARTE C · homologar e oficializar ──\n");
  const dims = await db.query<{ id: string }>(`select id from dimensions order by display_order`);
  check("o modelo tem dimensões semeadas", dims.rows.length > 0, `${dims.rows.length}`);

  await denied(db, "SM grava homologação", sm,
    `insert into homologations (cycle_id, dimension_id, official_stage, am_user_id)
       values ($1,$2,2,$3) returning cycle_id`, [cycle, dims.rows[0]!.id, U.smA]);
  await allowed(db, "AM grava homologação", am,
    `insert into homologations (cycle_id, dimension_id, official_stage, am_user_id)
       values ($1,$2,2,$3) returning cycle_id`, [cycle, dims.rows[0]!.id, U.am]);

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE de homologação (achado 6.3). A migration de papéis globais trocou
  // `homolog_write` (INSERT) e `homolog_read`, mas ESQUECEU `homolog_update`, que continuou
  // com a regra antiga: `am_user_id = auth.uid()` e nada de `is_portal_am()`.
  //
  // Ninguém tinha visto porque os testes cobriam INSERT e oficialização — nunca UPDATE
  // cruzado entre AMs, nem mutação das chaves. E como o frontend usa `upsert`, o UPDATE é o
  // caminho REAL na segunda edição: o fluxo "AM global homologa qualquer squad" quebrava em
  // silêncio.
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── PARTE C · UPDATE de homologação (papel, não posse) ──\n");
  const dimHomolog = dims.rows[0]!.id;

  // Segundo AM GLOBAL (o `po` do fixture ganha o papel). Como owner: conceder papel não é o
  // objeto deste teste.
  await db.query(`insert into portal_roles (email, role) values ($1,'am') on conflict do nothing`, [E.po]);
  const am2 = { sub: U.po, email: E.po };

  // O CASO QUE ESTAVA QUEBRADO: outro AM global editando homologação criada por um colega.
  await allowed(db, "AM #2 atualiza homologação criada pelo AM #1", am2,
    `update homologations set official_stage = 3
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`, [cycle, dimHomolog]);

  await allowed(db, "AM #1 corrige o conteúdo da própria homologação", am,
    `update homologations set justification = 'ajuste'
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`, [cycle, dimHomolog]);

  // Permissão vem do PAPEL, não de ter criado a linha.
  await denied(db, "SM atualiza homologação", sm,
    `update homologations set official_stage = 1
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`, [cycle, dimHomolog]);
  await denied(db, "member atualiza homologação", member,
    `update homologations set official_stage = 1
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`, [cycle, dimHomolog]);

  // Mover a linha de ciclo/dimensão é REIDENTIFICÁ-LA: `(cycle_id, dimension_id)` é a PK, e o
  // registro passaria a valer para outra avaliação levando `official_stage` consigo. O
  // `WITH CHECK` não consegue barrar (não vê a linha antiga) — quem barra é o trigger.
  await denied(db, "AM move homologação para OUTRA dimensão", am,
    `update homologations set dimension_id=$3
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`,
    [cycle, dimHomolog, dims.rows[1]!.id]);

  const outroCiclo = await db.query<{ id: string }>(
    `insert into assessment_cycles (team_id, quarter, status)
       values ($1,'2099Q4','homologation') returning id`, [B],
  );
  await denied(db, "AM move homologação para OUTRO ciclo", am,
    `update homologations set cycle_id=$3
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`,
    [cycle, dimHomolog, outroCiclo.rows[0]!.id]);

  // Completa as demais dimensões (service_role/owner: o seed não é o objeto do teste).
  for (const d of dims.rows.slice(1)) {
    await db.query(
      `insert into homologations (cycle_id, dimension_id, official_stage, am_user_id)
         values ($1,$2,2,$3) on conflict do nothing`,
      [cycle, d.id, U.am],
    );
  }

  const smOfficialize = await attempt(db, sm, `select officialize_cycle($1)`, [cycle]);
  check("SM officialize_cycle — NEGADO", !smOfficialize.ok, smOfficialize.error?.slice(0, 60));
  const amOfficialize = await attempt(db, am, `select officialize_cycle($1)`, [cycle]);
  check("AM officialize_cycle — permitido", amOfficialize.ok, amOfficialize.error?.slice(0, 120));

  const st = await db.query<{ status: string; homologated_by: string }>(
    `select status, homologated_by from assessment_cycles where id=$1`, [cycle],
  );
  check("ciclo ficou 'official'", st.rows[0]!.status === "official", st.rows[0]!.status);
  check("homologated_by registrou o AM", st.rows[0]!.homologated_by === U.am);

  // Ciclo oficializado: a janela de edição FECHOU. A policy antiga só exigia
  // `cycle.status = 'homologation'` no USING; agora o WITH CHECK exige também, então não dá
  // para empurrar conteúdo novo para uma avaliação já publicada.
  await denied(db, "AM atualiza homologação de ciclo JÁ oficializado", am,
    `update homologations set official_stage = 4
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`, [cycle, dimHomolog]);

  // Regressão: oficializar GERA os kaizens (a etapa "Plano"). Uma reescrita do RPC já
  // apagou esse insert por descuido nesta rodada — o teste existe por causa disso.
  const kz = await db.query<{ n: number }>(
    `select count(*)::int as n from kaizens where cycle_id=$1`, [cycle],
  );
  check("oficializar gerou kaizens", kz.rows[0]!.n > 0, `${kz.rows[0]!.n}`);

  const twice = await attempt(db, am, `select officialize_cycle($1)`, [cycle]);
  check("2ª chamada é recusada (não duplica o plano)", !twice.ok, twice.error?.slice(0, 60));
  const kz2 = await db.query<{ n: number }>(
    `select count(*)::int as n from kaizens where cycle_id=$1`, [cycle],
  );
  check("nº de kaizens não mudou", kz2.rows[0]!.n === kz.rows[0]!.n, `${kz.rows[0]!.n} → ${kz2.rows[0]!.n}`);

  console.log("\n── PARTE C · arquivar e destruir ──\n");
  await denied(db, "SM arquiva o ciclo oficial", sm,
    `update assessment_cycles set status='archived' where id=$1 returning id`, [cycle]);
  await allowed(db, "AM arquiva o ciclo oficial", am,
    `update assessment_cycles set status='archived' where id=$1 returning id`, [cycle]);

  // O pedido literal: "AM homologa, mas não deleta nem reseta nada".
  const amRestart = await attempt(db, am, `select restart_assessment($1, 'teste')`, [A]);
  check("AM restart_assessment — NEGADO", !amRestart.ok, amRestart.error?.slice(0, 60));
  const amDelete = await attempt(db, am, `select delete_squad($1)`, [A]);
  check("AM delete_squad — NEGADO", !amDelete.ok, amDelete.error?.slice(0, 60));
  const smRestart = await attempt(db, sm, `select restart_assessment($1, 'teste')`, [A]);
  check("SM restart_assessment — NEGADO", !smRestart.ok);

  // Motivo obrigatório desde 27/07: ação destrutiva sem justificativa registrada torna a
  // auditoria inútil depois.
  const adminRestart = await attempt(db, admin, `select restart_assessment($1, 'reset de teste')`, [A]);
  check("admin restart_assessment — permitido", adminRestart.ok, adminRestart.error?.slice(0, 120));

  // O reset volta ao COMEÇO da jornada, não à sessão (defeito corrigido em 26/07).
  const reset = await db.query<{ status: string; workshop_at: string | null }>(
    `select status, workshop_at from assessment_cycles where id=$1`, [cycle],
  );
  check("reset volta para 'pre_session'", reset.rows[0]!.status === "pre_session", reset.rows[0]!.status);
  check("reset limpa workshop_at", reset.rows[0]!.workshop_at === null);
  const kzAfter = await db.query<{ n: number }>(
    `select count(*)::int as n from kaizens where cycle_id=$1`, [cycle],
  );
  check("reset limpou os kaizens do ciclo", kzAfter.rows[0]!.n === 0);

  console.log("\n── PARTE C · diretório de pessoas ──\n");

  // Nenhuma policy de SELECT em profiles pode ter predicado trivial. Guarda contra o
  // vazamento achado em 26/07: a legada "Authenticated users can view all profiles"
  // (`auth.uid() is not null`) somava com OR e ANULAVA a profiles_read restritiva.
  const profilePolicies = await db.query<{ policyname: string; qual: string }>(
    `select policyname, coalesce(qual,'') as qual from pg_policies
      where schemaname='public' and tablename='profiles' and cmd='SELECT'`,
  );
  const trivial = profilePolicies.rows.filter(
    (p) => p.qual === "" || /^\(?\s*true\s*\)?$/i.test(p.qual) || /auth\.uid\(\)\s+IS\s+NOT\s+NULL/i.test(p.qual),
  );
  check(
    "nenhuma policy de SELECT em profiles é permissiva demais",
    trivial.length === 0,
    trivial.map((p) => p.policyname).join(", "),
  );
  check(
    "nenhuma policy de profiles depende da camada legada is_admin/user_roles",
    (
      await db.query<{ n: number }>(
        `select count(*)::int as n from pg_policies
          where schemaname='public' and tablename='profiles'
            and (coalesce(qual,'')||coalesce(with_check,'')) like '%is_admin(%'`,
      )
    ).rows[0]!.n === 0,
  );

  // Usuário NOVO, sem squad nenhum: tem de ver só o próprio perfil. Precisa ser criado
  // aqui e não reaproveitado — a esta altura do teste o admin já juntou todos no squad A,
  // e "compartilha squad" passou a ser verdade entre eles (corretamente).
  const loner = "66666666-6666-6666-6666-666666666666";
  await makeUser(db, loner, "loner@lm.test");
  const dirLoner = await asUser(db, { sub: loner, email: "loner@lm.test" }, async () =>
    (await db.query<{ id: string }>(`select id from profiles`)).rows.map((r) => r.id),
  );
  check(
    "usuário sem squad vê só o próprio perfil",
    dirLoner.length === 1 && dirLoner[0] === loner,
    `viu ${dirLoner.length} perfis`,
  );
  const smFind = await attempt(db, sm, `select * from find_profile_by_email($1)`, [E.memberB]);
  check("SM busca perfil por e-mail — NEGADO", !smFind.ok, smFind.error?.slice(0, 60));
  const adminFind = await attempt(db, admin, `select * from find_profile_by_email($1)`, [E.memberB]);
  check("admin busca perfil por e-mail — permitido", adminFind.ok && adminFind.rows === 1);

  console.log("\n── PARTE C · nenhuma escrita sem autenticação ──\n");
  // As tabelas do Maturity Model ANTIGO tinham `for all to public using (true)` — e
  // `public` inclui `anon`, ou seja: escrita com a chave anônima. Achado na auditoria de
  // 26/07. Esta asserção vale para o schema INTEIRO, não só para as 4 tabelas legadas.
  const anonWrite = await db.query<{ tablename: string; policyname: string; cmd: string }>(
    `select tablename, policyname, cmd from pg_policies
      where schemaname = 'public'
        and cmd <> 'SELECT'
        and (roles::text[] && array['public','anon'])`,
  );
  check(
    "nenhuma policy de escrita alcança public/anon",
    anonWrite.rows.length === 0,
    anonWrite.rows.map((r) => `${r.tablename}.${r.policyname}[${r.cmd}]`).join(", "),
  );

  console.log("\n── PARTE C · types.ts do Supabase bate com o schema ──\n");
  // `src/integrations/supabase/types.ts` é gerado, mas `portal_roles` e os dois RPCs novos
  // foram acrescentados À MÃO (a regeneração exige acesso ao projeto na nuvem). Sem esta
  // checagem, um erro de digitação ali viraria erro só em runtime, no navegador.
  const typesFile = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "integrations", "supabase", "types.ts"),
    "utf8",
  );
  const block = typesFile.slice(typesFile.indexOf("portal_roles: {"));
  const rowBlock = block.slice(block.indexOf("Row: {"), block.indexOf("Insert: {"));
  const declared = [...rowBlock.matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1]!).sort();
  const actual = (
    await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='portal_roles'`,
    )
  ).rows
    .map((r) => r.column_name)
    .sort();
  check(
    "colunas de portal_roles em types.ts == schema",
    JSON.stringify(declared) === JSON.stringify(actual),
    `ts=[${declared}] db=[${actual}]`,
  );
  for (const fn of ["has_perm", "has_perm_prefix", "my_permissions", "my_portal_roles"]) {
    check(`types.ts declara o RPC ${fn}`, new RegExp(`${fn}: \\{ Args:`).test(typesFile));
  }
  check("types.ts declara o RPC my_neo_claims", /my_neo_claims: \{/.test(typesFile));
  check(
    "types.ts não declara mais is_am(uuid) (função removida)",
    !/^\s+is_am: \{ Args:/m.test(typesFile),
  );
  // O front não pode continuar oferecendo o modelo antigo: um `supabase.rpc('is_portal_am')`
  // tipado compilaria e falharia só em runtime, no navegador.
  for (const fn of ["is_portal_admin", "is_portal_am", "is_sm", "is_member"]) {
    check(
      `types.ts não declara mais o RPC ${fn} (removido do banco)`,
      !new RegExp(`^\\s+${fn}: \\{ Args:`, "m").test(typesFile),
    );
  }

  // As 4 tabelas do RBAC, coluna por coluna contra o schema — mesma técnica do portal_roles
  // acima, e pelo mesmo motivo: elas foram declaradas À MÃO (regenerar exige o projeto na nuvem).
  for (const tabela of ["neo_roles", "neo_permissions", "neo_role_permissions", "neo_role_permissions_audit"]) {
    const bloco = typesFile.slice(typesFile.indexOf(`      ${tabela}: {`));
    const rows = bloco.slice(bloco.indexOf("Row: {"), bloco.indexOf("Insert: {"));
    const declaradas = [...rows.matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1]!).sort();
    const reais = (
      await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name=$1`,
        [tabela],
      )
    ).rows
      .map((r) => r.column_name)
      .sort();
    check(
      `colunas de ${tabela} em types.ts == schema`,
      JSON.stringify(declaradas) === JSON.stringify(reais),
      `ts=[${declaradas}] db=[${reais}]`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A MATRIZ É EDITÁVEL — e é isto que distingue este desenho de uma matriz decorativa.
  //
  // Sem estas asserções, `neo_role_permissions` poderia ser uma tabela bonita que a RLS
  // ignora, e ninguém notaria até alguém desligar uma permissão na tela e nada acontecer.
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── PARTE D · a matriz muda o comportamento de verdade ──\n");

  // Estado inicial: o SM do squad A não homologa (a semente não lhe dá a permissão).
  const smHomologaAntes = await asUser(db, sm, async () =>
    (await db.query<{ v: boolean }>(`select has_perm('mma.cycle.homologate', $1) as v`, [A])).rows[0]!.v,
  );
  check("antes: SM não homologa", smHomologaAntes === false);

  // LIGA na matriz (como owner: o objeto do teste é o efeito, não quem pode editar).
  await db.query(
    `insert into neo_role_permissions (role_id, permission_id) values ('sm','mma.cycle.homologate')`,
  );
  const smHomologaDepois = await asUser(db, sm, async () =>
    (await db.query<{ v: boolean }>(`select has_perm('mma.cycle.homologate', $1) as v`, [A])).rows[0]!.v,
  );
  check("LIGAR na matriz concede a permissão ao SM", smHomologaDepois === true);

  // E o efeito alcança a RLS de verdade, não só a função: o SM passa a gravar homologação.
  const cicloD = (
    await db.query<{ id: string }>(
      `insert into assessment_cycles (team_id, quarter, status)
         values ($1,'2030Q1','homologation') returning id`,
      [A],
    )
  ).rows[0]!.id;
  const dimD = (await db.query<{ id: string }>(`select id from dimensions limit 1`)).rows[0]!.id;
  await allowed(db, "SM com a permissão ligada GRAVA homologação (RLS)", sm,
    `insert into homologations (cycle_id, dimension_id, official_stage, am_user_id)
       values ($1,$2,2,$3) returning cycle_id`, [cicloD, dimD, U.smA]);

  // DESLIGA e o poder volta atrás — inclusive na RLS.
  await db.query(
    `delete from neo_role_permissions where role_id='sm' and permission_id='mma.cycle.homologate'`,
  );
  const smHomologaFim = await asUser(db, sm, async () =>
    (await db.query<{ v: boolean }>(`select has_perm('mma.cycle.homologate', $1) as v`, [A])).rows[0]!.v,
  );
  check("DESLIGAR na matriz revoga a permissão", smHomologaFim === false);
  await denied(db, "SM sem a permissão volta a ser barrado pela RLS", sm,
    `update homologations set official_stage = 4
       where cycle_id=$1 and dimension_id=$2 returning cycle_id`, [cicloD, dimD]);

  // Papel de squad concede só NO SQUAD. Se o `has_perm` ignorasse p_team, ligar uma permissão
  // para `sm` daria poder em todos os squads — o vetor de escalação que este modelo evita.
  await db.query(
    `insert into neo_role_permissions (role_id, permission_id) values ('sm','mma.cycle.homologate')`,
  );
  const smNoB = await asUser(db, sm, async () =>
    (await db.query<{ v: boolean }>(`select has_perm('mma.cycle.homologate', $1) as v`, [B])).rows[0]!.v,
  );
  check("papel de squad NÃO transborda para outro squad", smNoB === false);
  await db.query(
    `delete from neo_role_permissions where role_id='sm' and permission_id='mma.cycle.homologate'`,
  );

  // A trilha registra as quatro mudanças acima.
  const trilha = await db.query<{ n: number }>(
    `select count(*)::int as n from neo_role_permissions_audit
      where permission_id = 'mma.cycle.homologate' and role_id = 'sm'`,
  );
  check("a trilha da matriz registrou as mudanças", trilha.rows[0]!.n === 4, `${trilha.rows[0]!.n}`);

  // A separação Admin × Admin Geral é a decisão central desta rodada, e ela vive em TRÊS
  // permissões: conceder papel, editar a matriz e manter a allowlist de quem entra no NEO. As
  // três são só do Admin Geral. Sem asserção, a diferença entre os dois papéis é uma linha de
  // seed que qualquer edição futura apaga sem ninguém notar.
  console.log("\n── PARTE D · governança de acesso é só do Admin Geral ──\n");
  // ⚠️ `admin` NESTE ARQUIVO é o Admin GERAL: a migration renomeou `admin` → `admin_geral`, e
  // esta identidade veio de lá. Para testar o Admin operacional (papel NOVO, que nasce sem
  // ninguém) é preciso criar alguém — usar `admin` aqui provaria o oposto do que se quer.
  const opsId = "88888888-8888-8888-8888-888888888888";
  await makeUser(db, opsId, "opsadmin@lm.test");
  await db.query(`insert into portal_roles (email, role) values ('opsadmin@lm.test','admin')
                    on conflict (email, role) do nothing`);
  const adminOps = { sub: opsId, email: "opsadmin@lm.test" };

  await denied(db, "Admin operacional libera e-mail na allowlist do NEO", adminOps,
    `insert into neo_access (email, approved) values ('externo@parceiro.test', true) returning email`);
  await allowed(db, "Admin GERAL libera e-mail na allowlist do NEO", admin,
    `insert into neo_access (email, approved) values ('externo2@parceiro.test', true) returning email`);
  // E o Admin operacional segue podendo o que é dele: mexer na estrutura.
  await allowed(db, "Admin operacional AINDA cria squad (o que é dele)", adminOps,
    `insert into teams (name, tower) values ('Squad do Ops','LM') returning id`);

  console.log("\n── PARTE D · a guarda do caminho de administração ──\n");
  // "Totalmente editável" não inclui o direito de se trancar fora de forma irrecuperável.
  const suicidio = await attempt(db, admin,
    `delete from neo_role_permissions where permission_id = 'neo.matrix.manage'`);
  check(
    "desligar a ÚLTIMA permissão de editar a matriz é recusado",
    !suicidio.ok,
    suicidio.error?.slice(0, 90),
  );
  const suicidio2 = await attempt(db, admin,
    `delete from neo_role_permissions where permission_id = 'neo.roles.manage'`);
  check(
    "desligar a ÚLTIMA permissão de conceder papel é recusado",
    !suicidio2.ok,
    suicidio2.error?.slice(0, 90),
  );

  // Mas MOVER de papel é permitido — é isso que torna a trava mínima em vez de um veto.
  // Duas chamadas, e não duas instruções numa: `db.query` é prepared statement e recusa
  // múltiplos comandos. Funciona porque a guarda é AFTER STATEMENT — depois do insert as duas
  // permissões seguem alcançáveis, e depois do delete `am` já as detém.
  const mover1 = await attempt(db, admin,
    `insert into neo_role_permissions (role_id, permission_id) values ('am','neo.matrix.manage') returning role_id`);
  const mover2 = await attempt(db, admin,
    `delete from neo_role_permissions where role_id='admin_geral' and permission_id='neo.matrix.manage' returning role_id`);
  check(
    "MOVER a permissão de admin_geral para am é permitido",
    mover1.ok && mover2.ok,
    (mover1.error ?? mover2.error)?.slice(0, 90),
  );
  // Devolve ao estado semeado.
  await db.query(
    `insert into neo_role_permissions (role_id, permission_id) values ('admin_geral','neo.matrix.manage')
       on conflict do nothing`,
  );
  await db.query(`delete from neo_role_permissions where role_id='am' and permission_id='neo.matrix.manage'`);

  // ══════════════════════════════════════════════════════════════════════════
  // Autorização da sincronização de âncoras (achado P0.1 do review de 2026-07-27).
  //
  // A Edge Function `sync-anchors` não checava NADA: nem auth.uid(), nem papel, nem
  // pertencimento ao squad — e gravava com service_role. O cron a chamava com a anon key,
  // que é PÚBLICA. `verify_jwt` não cobre isso: ele prova que o token é assinado, e a anon
  // key também é um token assinado.
  //
  // A decisão passou a viver em `can_sync_anchors(team)`. Estes casos são o contrato que
  // o handler `sync-anchors-user` consulta.
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── PARTE C · quem pode sincronizar âncoras ──\n");
  const canSync = async (identity: { sub?: string; email?: string }, team: string) =>
    await asUser(db, identity, async () =>
      // `$1::uuid` explícito: sem o cast o Postgres não resolve a assinatura do parâmetro.
      (await db.query<{ can_sync_anchors: boolean }>(`select can_sync_anchors($1::uuid)`, [team]))
        .rows[0]!.can_sync_anchors,
    );

  check("SM sincroniza o PRÓPRIO squad", (await canSync(sm, A)) === true);
  check("SM NÃO sincroniza squad de outro", (await canSync(sm, B)) === false);
  check("member (não SM) NÃO sincroniza nem o próprio squad", (await canSync(member, B)) === false);
  check("AM global sincroniza qualquer squad", (await canSync(am, A)) === true && (await canSync(am, B)) === true);
  check("admin sincroniza qualquer squad", (await canSync(admin, A)) === true);

  // Sem sub no JWT (o caso da anon key: ela não representa pessoa nenhuma) → auth.uid() é
  // NULL, nenhum vínculo casa, e a resposta é false.
  check("identidade sem usuário (anon key) NÃO sincroniza", (await canSync({}, A)) === false);

  // Defesa em profundidade: além de devolver false, o papel `anon` não pode nem EXECUTAR.
  //
  // ⚠️ ORDEM IMPORTA, e o harness a inverte. Em produção o bootstrap do Supabase
  // (`grant all on all routines in schema public to anon, ...`) roda ANTES das migrations,
  // então o `revoke ... from anon` da migration é a última palavra. Aqui
  // `grantSupabaseDefaults()` roda DEPOIS, o que desfaz silenciosamente todo revoke de
  // migration. Reaplicar a migration restaura a ordem real — e é idempotente
  // (`create or replace` + revoke/grant).
  //
  // Isto vale para QUALQUER revoke de RPC neste repo: sem reaplicar, um teste de privilégio
  // aqui mede o shim, não a migration.
  //
  // Reaplica as migrations da RODADA DE RBAC, não a de 27/07: aquela recria `can_sync_anchors`
  // com o corpo antigo (que chama `is_sm()`, removida no RBAC) e morre. A de RBAC carrega os
  // revokes de todas as funções que redefine, justamente para poder ser o ponto de restauração
  // aqui.
  //
  // ⚠️ A LISTA `RODADA_RBAC`, e não "a migration mais recente": apontar para a mais recente fez
  // esta asserção quebrar assim que uma migration nova entrou depois da de RBAC — a nova não
  // carrega os revokes de `can_sync_anchors`, então o ponto de restauração se mudou sozinho.
  // Cada migration da rodada restaura os PRÓPRIOS revokes; todas precisam rodar, em ordem.
  for (const file of RODADA_RBAC) {
    await db.exec(migrationSql(file));
  }

  const anonCanExecute = (
    await db.query<{ has: boolean }>(
      `select has_function_privilege('anon', 'public.can_sync_anchors(uuid)', 'execute') as has`,
    )
  ).rows[0]!.has;
  check("papel anon não tem EXECUTE em can_sync_anchors", anonCanExecute === false);

  const authCanExecute = (
    await db.query<{ has: boolean }>(
      `select has_function_privilege('authenticated', 'public.can_sync_anchors(uuid)', 'execute') as has`,
    )
  ).rows[0]!.has;
  check("papel authenticated tem EXECUTE em can_sync_anchors", authCanExecute === true);

  // ══════════════════════════════════════════════════════════════════════════
  // Governança de papéis e ações destrutivas (achados 6.4, 6.6, 6.7).
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── PARTE C · governança: último admin, revogação, kaizen, reset ──\n");

  // ── Lockout ──
  // `portal_roles_write` permitia apagar QUALQUER linha, inclusive a última de admin. Sem
  // admin, ninguém concede admin: só service_role no SQL editor recupera.
  //
  // Testes anteriores desta PARTE C concedem papéis, então o estado aqui NÃO é o do fixture.
  // Como owner (bypassa RLS), deixo exatamente um admin — `E.admin`, que é a identidade usada
  // nas asserções — para o cenário de "último admin" ser o cenário real.
  await db.query(`delete from portal_roles where role='admin_geral' and email <> $1`, [E.admin]);
  const admins = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where role='admin_geral' and revoked_at is null`,
  );
  check("estado preparado: exatamente 1 Admin Geral", admins.rows[0]!.n === 1, `${admins.rows[0]!.n}`);

  await denied(db, "Admin Geral apaga o ÚLTIMO Admin Geral (lockout)", admin,
    `delete from portal_roles where role='admin_geral' returning email`);
  await denied(db, "Admin Geral rebaixa o ÚLTIMO Admin Geral para am", admin,
    `update portal_roles set role='am' where role='admin_geral' returning email`);

  // Com DOIS, remover um passa a ser legítimo.
  await db.query(`insert into portal_roles (email, role) values ($1,'admin_geral') on conflict do nothing`, [E.po]);
  await allowed(db, "com 2 Admins Gerais, remover um é permitido", admin,
    `delete from portal_roles where role='admin_geral' and email=$1 returning email`, [E.po]);

  // ── Escopo do papel: papel de squad não se concede globalmente ──
  // Sem esta trava, conceder 'sm' em portal_roles daria a alguém o papel de squad em TODOS
  // os squads de uma vez — um caminho lateral para a autoridade global.
  await denied(db, "conceder papel de SQUAD em portal_roles", admin,
    `insert into portal_roles (email, role) values ('escopo@lm.test','sm') returning email`);
  await denied(db, "conceder o papel implícito `todos` a alguém", admin,
    `insert into portal_roles (email, role) values ('escopo@lm.test','todos') returning email`);

  // ── Rastro de concessão ──
  check("granted_by é preenchido pelo BANCO, não pela app", await (async () => {
    await asUser(db, admin, async () => {
      await db.query(`insert into portal_roles (email, role) values ('novo@lm.test','am')`);
    });
    const r = await db.query<{ granted_by: string | null }>(
      `select granted_by from portal_roles where email='novo@lm.test'`,
    );
    return r.rows[0]?.granted_by === E.admin;
  })(), "confiar na app para preencher isso é o mesmo que não ter o campo");

  // ── Revogação DESLIGA o papel ──
  // Manter a linha é deliberado (a prova de que o acesso existiu é o que o offboarding precisa),
  // então os predicados têm de exigir `revoked_at is null` — senão revogar seria decorativo.
  const podeHomologar = async (identity: { sub?: string; email?: string }) =>
    await asUser(db, identity, async () =>
      (await db.query<{ v: boolean }>(`select has_perm('mma.cycle.homologate', $1) as v`, [A]))
        .rows[0]!.v,
    );

  await db.query(`insert into portal_roles (email, role) values ($1,'am') on conflict do nothing`, [E.memberB]);
  check("papel concedido liga a permissão", (await podeHomologar(member)) === true);

  await db.query(`update portal_roles set revoked_at = now() where email=$1 and role='am'`, [E.memberB]);
  check(
    "papel REVOGADO desliga a permissão (linha continua para auditoria)",
    (await podeHomologar(member)) === false,
  );
  const linhaViva = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where email=$1 and role='am'`, [E.memberB],
  );
  check("a linha revogada NÃO é apagada (prova do offboarding)", linhaViva.rows[0]!.n === 1);
  await db.query(`delete from portal_roles where email in ($1,'novo@lm.test')`, [E.memberB]);

  // ── Kaizen: criar/atualizar ≠ excluir ──
  const dimKaizen = dims.rows[0]!.id;
  await db.query(
    `insert into kaizens (team_id, cycle_id, dimension_id, title) values ($1,$2,$3,'kz de teste')
       on conflict do nothing`,
    [A, cycle, dimKaizen],
  );
  await allowed(db, "membro do squad ATUALIZA kaizen (execução é do time)", sm,
    `update kaizens set title='ajustado' where team_id=$1 returning id`, [A]);
  await denied(db, "membro do squad EXCLUI kaizen", sm,
    `delete from kaizens where team_id=$1 returning id`, [A]);
  await denied(db, "AM global EXCLUI kaizen", am,
    `delete from kaizens where team_id=$1 returning id`, [A]);
  await allowed(db, "admin EXCLUI kaizen", admin,
    `delete from kaizens where team_id=$1 returning id`, [A]);

  // ── Reset: motivo obrigatório e snapshot ──
  const semMotivo = await attempt(db, admin, `select restart_assessment($1, null)`, [A]);
  check("restart_assessment SEM motivo é recusado", !semMotivo.ok,
    semMotivo.error?.slice(0, 60));

  const assinaturaAntiga = await attempt(db, admin, `select restart_assessment($1)`, [A]);
  check(
    "assinatura de 1 argumento não existe mais (caminho sem auditoria)",
    !assinaturaAntiga.ok,
    assinaturaAntiga.error?.slice(0, 60),
  );

  console.log("\n── PARTE C · o operador não fica trancado fora ──\n");
  // Sem o bypass do trigger, um ciclo travado seria IRRECUPERÁVEL: nem seed, nem script,
  // nem SQL editor conseguiriam corrigi-lo. Aqui rodamos como owner (postgres).
  let operatorOk = true;
  try {
    await db.query(`update assessment_cycles set status='official' where id=$1`, [cycle]);
    await db.query(`update assessment_cycles set status='pre_session' where id=$1`, [cycle]);
  } catch {
    operatorOk = false;
  }
  check("owner/service_role faz transição arbitrária (bypass do trigger)", operatorOk);
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE E — `/api/authz`: consultar permissão SEM o JWT da pessoa
//
// O Nero é server-rendered e só tem o cookie do portal, não o JWT do Supabase. Quem pergunta
// por ele é `/api/authz`, uma function que também não tem JWT — ou seja, chama como `anon`.
//
// O CAMINHO PROIBIDO É O ÓBVIO: consultar com `service_role`. Foi o P0 do review de
// 2026-07-27 (`sync-anchors`), onde a autorização dependia de uma chave que qualquer portador
// da anon key acionava. Aqui quem autoriza é um segredo do Vault, e é ISSO que estas asserções
// provam — não que a função existe, mas que ela NEGA sem o segredo.
// ════════════════════════════════════════════════════════════════════════════
const SEGREDO_BOM = "s3gr3d0-de-teste-com-mais-de-32-caracteres-ok";

async function partE(db: PGlite) {
  console.log("\n── PARTE E · /api/authz: o segredo do Vault é o que autoriza ──\n");

  // Chamada como `anon`, exatamente como a function serverless faz: sem `sub`, sem e-mail no
  // JWT. Se o papel bastasse, isto devolveria as permissões — e seria o P0 de volta.
  const perms = async (email: string, secret: string | null) =>
    await asUser(db, { role: "anon" }, async () =>
      (
        await db.query<{ neo_perms_for_email: string[] }>(
          `select neo_perms_for_email($1::text, $2::text)`,
          [email, secret],
        )
      ).rows[0]!.neo_perms_for_email,
    );

  // ── Vault VAZIO: o estado de um deploy incompleto ──
  // Antes de semear o segredo, nem o segredo "certo" pode funcionar — não há certo ainda.
  check(
    "sem o segredo no Vault, ninguém recebe permissão (fail-closed)",
    (await perms(E.admin, SEGREDO_BOM)).length === 0,
  );

  await seedVaultSecret(db, "neo_authz_secret", SEGREDO_BOM);

  // ── Agora com o Vault semeado ──
  const doAdmin = await perms(E.admin, SEGREDO_BOM);
  check(
    "com o segredo certo, o admin recebe as permissões dele",
    doAdmin.length > 5 && doAdmin.includes("neo.admin.access"),
    `${doAdmin.length}: ${doAdmin.slice(0, 4).join(", ")}…`,
  );

  check("segredo ERRADO devolve {} (não as permissões)", (await perms(E.admin, "errado")).length === 0);
  check("segredo vazio devolve {}", (await perms(E.admin, "")).length === 0);
  check("segredo null devolve {}", (await perms(E.admin, null)).length === 0);
  // Prefixo certo e resto errado: o caso que uma comparação byte a byte com saída antecipada
  // trataria diferente de um segredo totalmente errado.
  check(
    "segredo com o prefixo certo devolve {}",
    (await perms(E.admin, SEGREDO_BOM.slice(0, -1) + "X")).length === 0,
  );

  // ── O e-mail é o sujeito, e ele importa ──
  const doMember = await perms(E.memberB, SEGREDO_BOM);
  check(
    "cada e-mail recebe as SUAS permissões, não as do admin",
    !doMember.includes("neo.admin.access") && doMember.length < doAdmin.length,
    `member: ${doMember.length} · admin: ${doAdmin.length}`,
  );
  check("e-mail vazio devolve {}", (await perms("", SEGREDO_BOM)).length === 0);
  check(
    "e-mail fora da allowlist do NEO devolve {}",
    (await perms("estranho@outraempresa.com", SEGREDO_BOM)).length === 0,
  );
  // A saída da LM (20260909120000) em uma asserção: o domínio que liberava acesso sozinho
  // passou a não significar nada. Sem isto, reintroduzir o atalho no SQL não quebraria nada.
  check(
    "domínio @lmmobilidade.com.br não concede mais nada por si só",
    (await perms("qualquer.pessoa@lmmobilidade.com.br", SEGREDO_BOM)).length === 0,
  );
  // Caixa alta e espaço em volta são normalizados — o e-mail vem de um JWT, não de um form.
  check(
    "e-mail é normalizado (caixa e espaços)",
    (await perms(`  ${E.admin.toUpperCase()}  `, SEGREDO_BOM)).length === doAdmin.length,
  );

  // ── O papel implícito `todos` alcança quem não tem papel nenhum ──
  // É o que impede a virada do RBAC de trancar fora quem só trabalha na empresa.
  //
  // "Estar na empresa" hoje é ESTAR NA ALLOWLIST: desde 20260909120000 não existe liberação
  // por domínio, e `todos` pende de `is_neo_email_allowed()`. Antes disso estas duas fixtures
  // eram `@lmmobilidade.com.br` e entravam sozinhas — o que fazia o teste depender de uma
  // regra que não existe mais. Agora o pertencimento é explícito, como em produção.
  await db.query(
    `insert into neo_access (email, approved) values ($1, true) on conflict (email) do nothing`,
    ["ninguem@lm.test"],
  );
  const semPapel = await perms("ninguem@lm.test", SEGREDO_BOM);
  check(
    "pessoa sem papel nenhum ainda recebe as permissões de `todos`",
    semPapel.length > 0,
    `${semPapel.join(", ")}`,
  );

  // ── Revogação corta o acesso na hora, sem esperar cookie novo ──
  // A PK de `portal_roles` é (email, role) — uma pessoa pode ter mais de um papel —, então o
  // conflito a tratar é o par, não o e-mail.
  await db.query(
    `insert into neo_access (email, approved) values ($1, true) on conflict (email) do nothing`,
    ["revogavel@lm.test"],
  );
  await db.query(
    `insert into portal_roles (email, role) values ($1, 'am') on conflict (email, role) do nothing`,
    ["revogavel@lm.test"],
  );
  const antesDaRevogacao = await perms("revogavel@lm.test", SEGREDO_BOM);
  await db.query(`update portal_roles set revoked_at = now() where email = $1`, [
    "revogavel@lm.test",
  ]);
  const depoisDaRevogacao = await perms("revogavel@lm.test", SEGREDO_BOM);
  check(
    "papel revogado deixa de conceder imediatamente",
    antesDaRevogacao.length > depoisDaRevogacao.length,
    `antes: ${antesDaRevogacao.length} · depois: ${depoisDaRevogacao.length}`,
  );

  // ── O Vault não pode ser lido por quem chama ──
  // A função é a ÚNICA porta para o segredo. Se `anon` pudesse ler a view, o gate seria
  // decorativo: bastaria consultar o segredo e depois usá-lo.
  const vault = await attempt(db, { role: "anon" } as never, `select * from vault.decrypted_secrets`);
  check("anon NÃO lê vault.decrypted_secrets", !vault.ok, vault.error?.slice(0, 70));

  // `anon` PODE executar esta função — e isso é intencional, não um revoke esquecido. Quem
  // chama é uma function serverless com a anon key e sem usuário. A asserção existe para que
  // ninguém "conserte" o que não está quebrado: revogar de anon aqui derruba o Nero inteiro.
  // O que protege não é o papel, é o segredo — provado nas asserções acima.
  const anonExecuta = (
    await db.query<{ has: boolean }>(
      `select has_function_privilege('anon', 'public.neo_perms_for_email(text,text)', 'execute') as has`,
    )
  ).rows[0]!.has;
  check("anon PODE executar neo_perms_for_email (de propósito — o gate é o segredo)", anonExecuta);

  // ── A permissão de squad NÃO vaza por aqui ──
  // `/api/authz` responde por PORTA, que é autoridade global. Devolver permissão de squad daria
  // ao Nero uma resposta que ele não sabe interpretar (permissão em QUAL squad?).
  const doSm = await perms(E.smA, SEGREDO_BOM);
  check(
    "permissão de papel de SQUAD não entra na resposta global",
    !doSm.includes("mma.cycle.session"),
    doSm.join(", "),
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE F — desligar uma pessoa (`offboard_person`)
//
// Sair da empresa é UMA intenção: revogar papéis E remover vínculos de squad. O que estas
// asserções perseguem não é "a função roda", é o meio-caminho: quem pode chamá-la, o que
// acontece quando ela recusa, e se a trilha guarda o que a pessoa TINHA antes.
// ════════════════════════════════════════════════════════════════════════════
async function partF(db: PGlite) {
  console.log("\n── PARTE F · desligar pessoa (offboard_person) ──\n");

  const desligar = async (
    identity: { sub?: string; email?: string },
    email: string,
    motivo: string,
  ) => await attempt(db, identity, `select offboard_person($1::text, $2::text)`, [email, motivo]);

  const adminGeral = { sub: U.admin, email: E.admin };

  // Alvo com papel global E vínculo de squad — é o caso que a função existe para resolver.
  await makeUser(db, "77777777-7777-7777-7777-777777777777", "sai@lm.test");
  const timeQualquer = (
    await db.query<{ id: string }>(`select id from teams order by name limit 1`)
  ).rows[0]!.id;
  await db.query(`insert into portal_roles (email, role) values ('sai@lm.test','am')
                    on conflict (email, role) do nothing`);
  // A PK de `squad_members` é (team_id, user_id, ROLE) — três colunas. O conflito a tratar é a
  // tripla; `on conflict (team_id, user_id)` não casa com índice nenhum e morre em 42P10.
  await db.query(`insert into squad_members (team_id, user_id, role) values ($1,$2,'sm')
                    on conflict (team_id, user_id, role) do nothing`,
    [timeQualquer, "77777777-7777-7777-7777-777777777777"]);

  // ── Quem NÃO pode ──
  const semMotivo = await desligar(adminGeral, "sai@lm.test", "   ");
  check("motivo em branco é recusado", !semMotivo.ok, semMotivo.error?.slice(0, 70));

  const peloAm = await desligar({ sub: U.am, email: E.am }, "sai@lm.test", "teste");
  check(
    "AM NÃO desliga ninguém (não tem as duas permissões)",
    !peloAm.ok,
    peloAm.error?.slice(0, 70),
  );

  // A recusa do AM não pode ter deixado rastro no caminho.
  const aindaTem = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where email='sai@lm.test' and revoked_at is null`,
  );
  check("a recusa não revogou nada pelo caminho", aindaTem.rows[0]!.n === 1);

  // ── O caminho feliz ──
  const ok = await desligar(adminGeral, "sai@lm.test", "saiu da empresa em 31/07");
  check("Admin Geral desliga", ok.ok, ok.error?.slice(0, 90));

  const depois = await db.query<{ papeis: number; squads: number }>(
    `select
       (select count(*)::int from portal_roles
         where email='sai@lm.test' and revoked_at is null) as papeis,
       (select count(*)::int from squad_members
         where user_id='77777777-7777-7777-7777-777777777777') as squads`,
  );
  check("o papel global foi revogado", depois.rows[0]!.papeis === 0);
  check("os vínculos de squad sumiram", depois.rows[0]!.squads === 0);

  const trilha = await db.query<{ reason: string; snapshot: { papeis: string[]; squads: unknown[] } }>(
    `select reason, snapshot from destructive_audit
      where action='offboard_person' order by created_at desc limit 1`,
  );
  check("a trilha registrou o desligamento com o motivo",
    trilha.rows[0]?.reason === "saiu da empresa em 31/07");
  // O snapshot é o que responde "o que essa pessoa tinha?" — se ele for gravado DEPOIS das
  // mudanças, vem vazio e a trilha vira um recibo sem conteúdo.
  check(
    "o snapshot guarda o que a pessoa TINHA antes",
    trilha.rows[0]?.snapshot?.papeis?.includes("am") === true &&
      (trilha.rows[0]?.snapshot?.squads?.length ?? 0) === 1,
    JSON.stringify(trilha.rows[0]?.snapshot),
  );

  // ── Idempotência: clicar duas vezes não pode explodir ──
  const denovo = await desligar(adminGeral, "sai@lm.test", "de novo");
  check("desligar de novo não dá erro (0 papéis, 0 squads)", denovo.ok, denovo.error?.slice(0, 70));

  // ── Pessoa que nunca fez login: tem papel, não tem squad ──
  await db.query(`insert into portal_roles (email, role) values ('nunca@lm.test','am')
                    on conflict (email, role) do nothing`);
  const semConta = await desligar(adminGeral, "nunca@lm.test", "convite cancelado");
  check("desliga quem nunca logou (papel revogado, zero squads)", semConta.ok,
    semConta.error?.slice(0, 70));
  const revogado = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles
      where email='nunca@lm.test' and revoked_at is not null`,
  );
  check("o papel de quem nunca logou foi revogado", revogado.rows[0]!.n === 1);

  // ── A trava do último Admin Geral vale aqui também ──
  // Não é código desta função: é o trigger `protect_last_admin` abortando a transação inteira.
  // A asserção existe porque um `security definer` poderia ter contornado sem ninguém notar.
  const sobrando = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles
      where role='admin_geral' and revoked_at is null`,
  );
  if (sobrando.rows[0]!.n === 1) {
    const suicidio = await desligar(adminGeral, E.admin, "tentando me desligar");
    check(
      "desligar o ÚLTIMO Admin Geral é abortado pelo trigger",
      !suicidio.ok,
      suicidio.error?.slice(0, 90),
    );
  } else {
    check("estado inesperado: mais de um Admin Geral ativo nesta altura", false,
      `${sobrando.rows[0]!.n} admins gerais`);
  }

  // ── `anon` não executa ──
  const anonExecuta = (
    await db.query<{ has: boolean }>(
      `select has_function_privilege('anon', 'public.offboard_person(text,text)', 'execute') as has`,
    )
  ).rows[0]!.has;
  check("papel anon NÃO tem EXECUTE em offboard_person", !anonExecuta);
}

async function main() {
  const db = await partA();
  await partB();
  await partC(db);
  await partE(db);
  await partF(db);
  await db.close();

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nErro fatal:", e);
  process.exit(2);
});
