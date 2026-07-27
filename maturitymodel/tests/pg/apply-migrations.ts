/**
 * Aplica TODAS as migrations do MMA, em ordem, num Postgres limpo (PGlite/WASM).
 *
 * Responde à pergunta que nenhum outro teste responde: **esta migration roda?**
 * Antes disto, `20260726120000_portal_roles.sql` eram 380 linhas de SQL nunca executadas.
 *
 * Uso: pnpm -C maturitymodel test:migrations
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { createSupabaseLikeDb, grantSupabaseDefaults } from "./supabase-shim.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, "..", "..", "supabase", "migrations");

/**
 * Migrations que o PGlite não consegue rodar, com o motivo. Ficar fora daqui é o padrão;
 * cada entrada é uma exceção que precisa se justificar.
 */
const SKIP: Record<string, string> = {
  "20260712190000_anchor_sync_cron.sql":
    "pg_cron + pg_net não existem no PGlite. Só agenda um job HTTP diário — não cria schema, tabela nem policy, então não afeta o que este harness verifica.",
  "20260727130100_anchor_sync_cron_secret.sql":
    "pg_cron + pg_net + supabase_vault não existem no PGlite. Só reagenda o job HTTP (agora com secret do Vault em vez da anon key). A AUTORIZAÇÃO dessa mudança vive na migration 20260727130000, que roda aqui e é verificada em tests/pg/rls-local.ts (PARTE C · quem pode sincronizar âncoras) — foi por isso que as duas foram separadas.",
};

export async function applyAllMigrations(
  db: PGlite,
  opts: { verbose?: boolean; stopBefore?: string; startAfter?: string; grants?: boolean } = {},
): Promise<{ applied: string[]; skipped: string[] }> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    // `stopBefore` permite parar no estado ANTERIOR a uma migration para semear dados
    // realistas e depois aplicá-la — é como se ensaia a migração de dados.
    if (opts.stopBefore && file >= opts.stopBefore) break;
    // `startAfter` retoma DEPOIS de uma migration já aplicada à mão. Sem isto, o harness de
    // RLS parava na migration de papéis e NUNCA aplicava as posteriores — `drop_is_any_am` e
    // a autorização das âncoras ficavam fora do teste sem ninguém notar.
    if (opts.startAfter && file <= opts.startAfter) continue;
    if (SKIP[file]) {
      skipped.push(file);
      if (opts.verbose) console.log(`  ⤳ ${file}\n      pulada: ${SKIP[file]}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      applied.push(file);
      if (opts.verbose) console.log(`  ✓ ${file}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`FALHOU em ${file}:\n      ${msg}`);
    }
  }

  if (opts.grants !== false) await grantSupabaseDefaults(db);
  return { applied, skipped };
}

/** Caminho da migration de papéis — usada como marco pelos testes. */
export const PORTAL_ROLES_MIGRATION = "20260726120000_portal_roles.sql";

export function migrationSql(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

// Execução direta: aplica e descreve o resultado.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = await createSupabaseLikeDb();
  console.log("\nAplicando migrations do MMA em Postgres limpo (PGlite/WASM)\n");

  const { applied, skipped } = await applyAllMigrations(db, { verbose: true });
  console.log(`\n${applied.length} aplicadas, ${skipped.length} puladas.\n`);

  // ── O schema resultante bate com o modelo novo de papéis? ────────────────
  const q = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[];
  let failed = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    if (ok) console.log(`  ✓ ${label}`);
    else {
      failed++;
      console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    }
  };

  console.log("Schema resultante:");
  const tables = (await q(`select tablename from pg_tables where schemaname = 'public'`)).map(
    (r) => r.tablename as string,
  );
  check("portal_roles existe", tables.includes("portal_roles"));
  check("portal_admins foi removida", !tables.includes("portal_admins"));

  const fns = (
    await q(`select p.proname from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'`)
  ).map((r) => r.proname as string);
  check("is_portal_am() existe", fns.includes("is_portal_am"));
  check("my_portal_roles() existe", fns.includes("my_portal_roles"));
  check("is_am(uuid) foi removida", !fns.includes("is_am"));
  check("enforce_cycle_transition() existe", fns.includes("enforce_cycle_transition"));

  const triggers = (
    await q(`select tgname from pg_trigger where not tgisinternal`)
  ).map((r) => r.tgname as string);
  check("trigger cycle_transition_guard instalado", triggers.includes("cycle_transition_guard"));

  // O CHECK precisa ter sido de fato apertado — é o que impede o papel morto de voltar.
  const roleCheck = await q(`
    select pg_get_constraintdef(oid) as def from pg_constraint
     where conname = 'squad_members_role_check'`);
  const def = (roleCheck[0]?.def as string) ?? "";
  check(
    "squad_members.role aceita só ('sm','member')",
    def.includes("'sm'") && def.includes("'member'") && !def.includes("'am'"),
    def || "constraint ausente",
  );

  // Nenhuma policy pode ter ficado no modelo por squad. Se `is_am` tivesse sobrado numa
  // policy, o `drop function` da migration teria falhado — este check é a confirmação
  // pelo outro lado.
  const policies = await q(`
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%is_am(%'`);
  check("nenhuma policy usa is_am(team)", policies.length === 0, JSON.stringify(policies));

  const amPolicies = await q(`
    select count(*)::int as n from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%is_portal_am(%'`);
  check(
    "policies migradas para is_portal_am()",
    (amPolicies[0]?.n as number) > 0,
    `${amPolicies[0]?.n} policies`,
  );

  // O cabeçalho da migration afirma que ela é idempotente. Afirmação em comentário não
  // vale nada sem teste: `db push` pode reaplicar, e uma migration que só roda uma vez
  // deixa o banco a meio caminho na segunda tentativa.
  console.log("\nIdempotência (aplicar 2ª vez):");
  let reapplied = true;
  let reapplyError = "";
  try {
    await db.exec(migrationSql(PORTAL_ROLES_MIGRATION));
  } catch (e) {
    reapplied = false;
    reapplyError = e instanceof Error ? e.message : String(e);
    await db.exec("rollback").catch(() => undefined);
  }
  check("20260726120000_portal_roles.sql reaplica sem erro", reapplied, reapplyError);

  console.log(failed === 0 ? "\nSchema OK.\n" : `\n${failed} verificações falharam.\n`);
  process.exit(failed === 0 ? 0 : 1);
}
