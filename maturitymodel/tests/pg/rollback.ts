/**
 * ENSAIO DO ROLLBACK do RBAC, em Postgres real (PGlite/WASM).
 *
 * Por que isto existe: "rollback escrito" e "rollback que funciona" são coisas diferentes, e a
 * diferença só aparece na hora em que ninguém quer descobri-la. Este repo já registrou o custo
 * de SQL revisado mas nunca executado (`20260726120000` eram 380 linhas nunca rodadas até o
 * harness de PGlite existir).
 *
 * Prova três coisas:
 *   1. O rollback APLICA num banco que passou pela migration de ida.
 *   2. O modelo antigo volta INTEIRO — funções, policies e o nome do papel.
 *   3. O FREIO funciona: se alguém tiver o papel `admin` novo (que não existe no modelo
 *      antigo), o rollback ABORTA em vez de promover essa pessoa a admin pleno em silêncio.
 *
 * Uso: pnpm -C maturitymodel test:rollback
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyAllMigrations } from "./apply-migrations.ts";
import { createSupabaseLikeDb, makeUser } from "./supabase-shim.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const rollbackSql = (file: string) =>
  readFileSync(join(HERE, "..", "..", "supabase", "rollback", file), "utf8");

const ROLLBACK_SQL = rollbackSql("20260731120000_neo_rbac_DOWN.sql");

/**
 * Os DOWNs da rodada, na ordem de execução: o INVERSO de `RODADA_RBAC`. As funções que leem as
 * tabelas do RBAC saem primeiro; o modelo, por último.
 */
const RODADA_DOWN: Array<[string, string]> = [
  ["20260731140000_offboard_person_DOWN", rollbackSql("20260731140000_offboard_person_DOWN.sql")],
  ["20260731130000_neo_authz_rpc_DOWN", rollbackSql("20260731130000_neo_authz_rpc_DOWN.sql")],
  ["20260731120000_neo_rbac_DOWN", ROLLBACK_SQL],
];

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

const ADMIN = "11111111-1111-1111-1111-111111111111";
const OPS = "22222222-2222-2222-2222-222222222222";

/** Banco com todas as migrations aplicadas e um Admin Geral de verdade. */
async function comRbac(): Promise<PGlite> {
  const db = await createSupabaseLikeDb();
  await applyAllMigrations(db);
  await makeUser(db, ADMIN, "admin@lm.test");
  await db.query(
    `insert into portal_roles (email, role) values ('admin@lm.test','admin_geral')
       on conflict do nothing`,
  );
  return db;
}

async function fns(db: PGlite): Promise<string[]> {
  return (
    await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public'`,
    )
  ).rows.map((r) => r.proname);
}

async function tabelas(db: PGlite): Promise<string[]> {
  return (
    await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public'`,
    )
  ).rows.map((r) => r.tablename);
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 1 — o caminho feliz
// ════════════════════════════════════════════════════════════════════════════
console.log("\n── PARTE 1 · o rollback aplica e restaura o modelo antigo ──\n");
{
  const db = await comRbac();

  check("estado inicial: has_perm existe", (await fns(db)).includes("has_perm"));

  let ok = true;
  let erro = "";
  try {
    await db.exec(ROLLBACK_SQL);
  } catch (e) {
    ok = false;
    erro = e instanceof Error ? e.message : String(e);
    await db.exec("rollback").catch(() => undefined);
  }
  check("o rollback aplica sem erro", ok, erro.slice(0, 200));

  if (ok) {
    const f = await fns(db);
    const t = await tabelas(db);

    for (const nome of ["is_portal_admin", "is_portal_am", "is_sm", "is_member"]) {
      check(`${nome}() voltou`, f.includes(nome));
    }
    for (const nome of ["has_perm", "has_perm_prefix", "my_permissions", "my_neo_claims"]) {
      check(`${nome}() saiu`, !f.includes(nome));
    }
    for (const nome of ["neo_roles", "neo_permissions", "neo_role_permissions", "neo_role_permissions_audit"]) {
      check(`tabela ${nome} saiu`, !t.includes(nome));
    }

    // O papel volta ao nome antigo — e é isto que devolve o acesso a quem já era admin.
    const papel = await db.query<{ role: string }>(
      `select role from portal_roles where email='admin@lm.test'`,
    );
    check("admin_geral voltou a se chamar admin", papel.rows[0]?.role === "admin", papel.rows[0]?.role);

    // O CHECK antigo tem de estar de volta, senão o banco aceitaria papel que o modelo
    // antigo não conhece.
    const chk = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conname='portal_roles_role_check'`,
    );
    check(
      "o CHECK antigo de portal_roles.role voltou",
      (chk.rows[0]?.def ?? "").includes("'admin'") && (chk.rows[0]?.def ?? "").includes("'am'"),
      chk.rows[0]?.def ?? "ausente",
    );

    // Nenhuma policy pode ter ficado apontando para o RBAC que acabou de sair: seria uma
    // policy que referencia função inexistente — erro em runtime, no primeiro acesso.
    const orfas = await db.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname='public'
          and (coalesce(qual,'')||coalesce(with_check,'')) like '%has_perm%'`,
    );
    check(
      "nenhuma policy ficou apontando para has_perm",
      orfas.rows.length === 0,
      orfas.rows.map((r) => `${r.tablename}.${r.policyname}`).join(", "),
    );

    // E o modelo antigo tem de estar de fato EM USO pelas policies, não só disponível.
    const usando = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_policies
        where schemaname='public'
          and (coalesce(qual,'')||coalesce(with_check,'')) ~ '(is_portal_admin|is_portal_am|is_sm|is_member)\\('`,
    );
    check(
      "as policies voltaram a usar o modelo antigo",
      usando.rows[0]!.n > 25,
      `${usando.rows[0]!.n} policies`,
    );

    // O trigger da jornada tem de voltar a existir e a funcionar (não só a função).
    const trg = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_trigger
        where tgname='cycle_transition_guard' and not tgisinternal`,
    );
    check("o trigger da jornada continua instalado", trg.rows[0]!.n === 1);
  }

  await db.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 2 — o freio
//
// O papel `admin` novo é OPERACIONAL: não governa acesso. No modelo antigo, `admin` é
// TODO-PODEROSO. Voltar sem pensar transformaria um no outro em silêncio — escalação de
// privilégio como efeito colateral de um rollback.
// ════════════════════════════════════════════════════════════════════════════
console.log("\n── PARTE 2 · o freio: papel Admin novo em uso ABORTA o rollback ──\n");
{
  const db = await comRbac();
  await makeUser(db, OPS, "ops@lm.test");
  await db.query(`insert into portal_roles (email, role) values ('ops@lm.test','admin')`);

  let abortou = false;
  let msg = "";
  try {
    await db.exec(ROLLBACK_SQL);
  } catch (e) {
    abortou = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  check("o rollback ABORTA com Admin operacional em uso", abortou, "reverteu em silêncio!");
  check(
    "a mensagem nomeia a pessoa e explica a decisão a tomar",
    /ABORTADO/.test(msg) && /ops@lm\.test/.test(msg) && /admin PLENO/.test(msg),
    msg.slice(0, 160),
  );

  await db.exec("rollback").catch(() => undefined);

  // E aborta ANTES de mexer em nada: a transação inteira desfaz.
  const intacto = await fns(db);
  check("nada foi revertido (rollback da transação)", intacto.includes("has_perm"));

  await db.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 3 — a RODADA INTEIRA revertida, na ordem documentada
//
// A rodada de RBAC são duas migrations, então o rollback são dois arquivos. `20260731130000`
// (o RPC do /api/authz) sai ANTES de `20260731120000` (o modelo), porque a função dele lê as
// tabelas que o modelo cria.
//
// POR QUE O POSTGRES NÃO PEGA A ORDEM ERRADA SOZINHO: ele rastreia dependência de função usada
// em expressão de POLICY, mas o corpo de uma função `plpgsql` é TEXTO, resolvido só em runtime.
// Derrubar o modelo primeiro NÃO dá erro — deixa `neo_perms_for_email` de pé apontando para
// tabelas que não existem mais, e o erro aparece no primeiro acesso ao Nero. É a mesma classe
// de armadilha que o `apply-migrations` já persegue nos corpos de função.
// ════════════════════════════════════════════════════════════════════════════
console.log("\n── PARTE 3 · a rodada inteira revertida, na ordem documentada ──\n");
{
  const db = await comRbac();
  const antes = await fns(db);
  check("estado inicial: neo_perms_for_email existe", antes.includes("neo_perms_for_email"));
  check("estado inicial: offboard_person existe", antes.includes("offboard_person"));

  let ok = true;
  let erro = "";
  for (const [nome, sql] of RODADA_DOWN) {
    try {
      await db.exec(sql);
    } catch (e) {
      ok = false;
      erro = `${nome}: ${e instanceof Error ? e.message : String(e)}`;
      await db.exec("rollback").catch(() => undefined);
      break;
    }
  }
  check("os dois rollbacks aplicam na ordem documentada", ok, erro.slice(0, 200));

  if (ok) {
    const f = await fns(db);
    check("neo_perms_for_email saiu", !f.includes("neo_perms_for_email"));
    check("offboard_person saiu", !f.includes("offboard_person"));
    check("has_perm saiu", !f.includes("has_perm"));
    check("is_portal_admin voltou", f.includes("is_portal_admin"));

    // O que a ordem errada deixaria para trás: uma função de pé citando tabela que não existe.
    // Depois da rodada inteira, nenhum corpo pode mencionar as tabelas do RBAC.
    const pendurados = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.prokind='f'
          and pg_get_functiondef(p.oid) ~ '(neo_role_permissions|neo_permissions|neo_roles)\\M'`,
    );
    check(
      "nenhuma função ficou citando tabela do RBAC que saiu",
      pendurados.rows.length === 0,
      pendurados.rows.map((r) => r.proname).join(", "),
    );
  }

  await db.close();
}

console.log(`\n${passed} passaram, ${failed} falharam.\n`);
process.exit(failed === 0 ? 0 : 1);
