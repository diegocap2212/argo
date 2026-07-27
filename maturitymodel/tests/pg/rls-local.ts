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
} from "./apply-migrations.ts";
import { asUser, createSupabaseLikeDb, grantSupabaseDefaults, makeUser } from "./supabase-shim.ts";

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

  const adminRow = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where role = 'admin' and email = $1`,
    [E.admin],
  );
  check("portal_admins → portal_roles(admin)", adminRow.rows[0]!.n === 1);

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

  const adminIsAm = await asUser(db, admin, async () =>
    (await db.query<{ is_portal_am: boolean }>(`select is_portal_am()`)).rows[0]!.is_portal_am,
  );
  check("is_portal_am() é true para o admin", adminIsAm === true);

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
  for (const fn of ["is_portal_am", "my_portal_roles"]) {
    check(`types.ts declara o RPC ${fn}`, new RegExp(`${fn}: \\{ Args:`).test(typesFile));
  }
  check(
    "types.ts não declara mais is_am(uuid) (função removida)",
    !/^\s+is_am: \{ Args:/m.test(typesFile),
  );

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
  await db.exec(migrationSql("20260727130000_anchor_sync_authz.sql"));

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
  await db.query(`delete from portal_roles where role='admin' and email <> $1`, [E.admin]);
  const admins = await db.query<{ n: number }>(
    `select count(*)::int as n from portal_roles where role='admin' and revoked_at is null`,
  );
  check("estado preparado: exatamente 1 admin", admins.rows[0]!.n === 1, `${admins.rows[0]!.n}`);

  await denied(db, "admin apaga o ÚLTIMO admin (lockout)", admin,
    `delete from portal_roles where role='admin' returning email`);
  await denied(db, "admin rebaixa o ÚLTIMO admin para am", admin,
    `update portal_roles set role='am' where role='admin' returning email`);

  // Com DOIS admins, remover um passa a ser legítimo.
  await db.query(`insert into portal_roles (email, role) values ($1,'admin') on conflict do nothing`, [E.po]);
  await allowed(db, "com 2 admins, remover um é permitido", admin,
    `delete from portal_roles where role='admin' and email=$1 returning email`, [E.po]);

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
  await db.query(`insert into portal_roles (email, role) values ($1,'am') on conflict do nothing`, [E.memberB]);
  const amAntes = await asUser(db, member, async () =>
    (await db.query<{ v: boolean }>(`select is_portal_am() as v`)).rows[0]!.v,
  );
  check("papel concedido ativa is_portal_am()", amAntes === true);

  await db.query(`update portal_roles set revoked_at = now() where email=$1 and role='am'`, [E.memberB]);
  const amDepois = await asUser(db, member, async () =>
    (await db.query<{ v: boolean }>(`select is_portal_am() as v`)).rows[0]!.v,
  );
  check("papel REVOGADO desliga is_portal_am() (linha continua para auditoria)", amDepois === false);
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

async function main() {
  const db = await partA();
  await partB();
  await partC(db);
  await db.close();

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nErro fatal:", e);
  process.exit(2);
});
