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

/**
 * A migration MAIS RECENTE — é a que o teste de idempotência reaplica.
 *
 * Reaplicar uma migration ANTIGA por cima de uma nova não é idempotência, é viagem no tempo:
 * `20260726120000` referencia `is_portal_admin()`, que `20260731120000` remove de propósito.
 * O que importa verificar é que a migration sendo INTRODUZIDA sobrevive a um `db push` repetido.
 */
export const NEWEST_MIGRATION = "20260909120000_remove_lm_domain_allowlist.sql";

/** A migration que introduz o modelo RBAC — reaplicada à parte no teste de idempotência. */
export const RBAC_MIGRATION = "20260731120000_neo_rbac.sql";

/**
 * AS MIGRATIONS DA RODADA DE RBAC, em ordem de aplicação. FONTE ÚNICA — não repetir a ordem.
 *
 * Por que uma lista e não `NEWEST_MIGRATION`: dois testes reaplicam migrations para restaurar
 * os revokes que o shim desfaz (ele concede os defaults do Supabase DEPOIS das migrations,
 * invertendo a ordem real da produção). Enquanto isso apontava para "a mais recente", o ponto
 * de restauração **se mudava sozinho** a cada migration nova — e foi assim que a asserção
 * "anon não tem EXECUTE em can_sync_anchors" parou de medir o que dizia medir, no meio desta
 * mesma rodada. Cada migration restaura os PRÓPRIOS revokes; todas precisam rodar.
 *
 * O rollback usa a MESMA lista, invertida.
 */
export const RODADA_RBAC = [
  "20260731120000_neo_rbac.sql",
  "20260731130000_neo_authz_rpc.sql",
  "20260731140000_offboard_person.sql",
  "20260731150000_fix_orfaos_view_rls.sql",
] as const;

/** Funções do modelo de autorização ANTIGO. Nenhuma pode sobreviver ao RBAC. */
export const MODELO_ANTIGO = ["is_portal_admin", "is_portal_am", "is_sm", "is_member"];

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
  // Genérico com default: `q(sql)` segue devolvendo linhas destipadas (os call sites antigos
  // usam `r.x as string`), e `q<{ n: number }>(sql)` tipa quando o chamador sabe a forma.
  // Sem o genérico o `tsc -b` acusa TS2558 nos call sites tipados — e o `tsx` não acusa,
  // porque apaga os tipos em vez de checá-los.
  const q = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
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
  check("has_perm() existe", fns.includes("has_perm"));
  check("has_perm_prefix() existe", fns.includes("has_perm_prefix"));
  check("my_permissions() existe", fns.includes("my_permissions"));
  check("my_neo_claims() existe", fns.includes("my_neo_claims"));
  check("neo_perms_for_email() existe", fns.includes("neo_perms_for_email"));
  check("my_portal_roles() existe", fns.includes("my_portal_roles"));
  check("is_am(uuid) foi removida", !fns.includes("is_am"));
  check("enforce_cycle_transition() existe", fns.includes("enforce_cycle_transition"));

  // O modelo antigo tem de ter saído INTEIRO. O `drop function` no fim da migration já
  // falharia se uma POLICY ainda o referenciasse (o Postgres rastreia essa dependência) —
  // esta checagem cobre o outro lado.
  for (const fn of MODELO_ANTIGO) {
    check(`${fn}() foi removida`, !fns.includes(fn));
  }

  const tabelasRbac = [
    "neo_roles",
    "neo_permissions",
    "neo_role_permissions",
    "neo_role_permissions_audit",
    "neo_role_permissions_default",
  ];
  for (const t of tabelasRbac) check(`${t} existe`, tables.includes(t));

  // A matriz semente tem de ter sido semeada. Uma matriz vazia não é "sem permissão
  // concedida" — é o portal inteiro fechado, e passaria calado por todas as outras checagens.
  const seed = await q(`select
      (select count(*)::int from neo_roles) as papeis,
      (select count(*)::int from neo_permissions) as perms,
      (select count(*)::int from neo_role_permissions) as matriz`);
  check("neo_roles semeada com 6 papéis", seed[0]!.papeis === 6, `${seed[0]!.papeis}`);
  check("catálogo de permissões semeado", (seed[0]!.perms as number) > 20, `${seed[0]!.perms}`);
  check("matriz semeada", (seed[0]!.matriz as number) > 50, `${seed[0]!.matriz}`);

  // O "restaurar padrão" da tela lê `neo_role_permissions_default`. Se ela ficasse vazia, o
  // botão restauraria uma matriz VAZIA — o portal inteiro fechado, com um clique bem-intencionado.
  const padrao = await q<{ n: number; iguais: number }>(`select
      (select count(*)::int from neo_role_permissions_default) as n,
      (select count(*)::int from neo_role_permissions_default d
        join neo_role_permissions rp
          on rp.role_id = d.role_id and rp.permission_id = d.permission_id) as iguais`);
  check(
    "a matriz-padrão foi congelada com o mesmo conteúdo da semente",
    padrao[0]!.n === (seed[0]!.matriz as number) && padrao[0]!.iguais === padrao[0]!.n,
    `padrão=${padrao[0]!.n} semente=${seed[0]!.matriz} coincidentes=${padrao[0]!.iguais}`,
  );

  // Toda permissão do catálogo tem de estar em ALGUM papel. Uma permissão órfã é um
  // interruptor que não acende nada — ou a policy esqueceu de existir, ou o seed esqueceu a linha.
  const orfas = await q<{ id: string }>(`
    select p.id from neo_permissions p
     where not exists (select 1 from neo_role_permissions rp where rp.permission_id = p.id)`);
  check(
    "nenhuma permissão do catálogo ficou fora da matriz",
    orfas.length === 0,
    orfas.map((o) => o.id).join(", "),
  );

  // ⚠️ VIEW EM POSTGRES É `SECURITY DEFINER` POR PADRÃO — e isso já custou um vazamento.
  //
  // `v_portal_roles_orfaos` foi escrita como `create view` comum em 20260727180000, então
  // rodava com os privilégios do DONO e passava por cima da policy `portal_roles_read`:
  // qualquer autenticado lia e-mail, papel e quem concedeu. Nem a revisão nem este harness
  // pegaram (pg_policies não enxerga views); quem pegou foi o `supabase db advisors`, depois
  // de a migration já estar em PRODUÇÃO. Corrigido em 20260731150000.
  //
  // Esta checagem vale para TODA view de `public`, não só para aquela: a próxima nasce com o
  // mesmo padrão inseguro e ninguém vai lembrar.
  const viewsInseguras = await q<{ viewname: string }>(`
    select c.relname as viewname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and coalesce((
         select option_value from pg_options_to_table(c.reloptions)
          where option_name = 'security_invoker'
       ), 'false') <> 'true'`);
  check(
    "toda view de public é security_invoker (não contorna RLS)",
    viewsInseguras.length === 0,
    viewsInseguras.map((v) => v.viewname).join(", "),
  );

  // Uma view publicada não deve alcançar o schema de autenticação.
  const viewsComAuthUsers = await q<{ viewname: string }>(`
    select c.relname as viewname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and pg_get_viewdef(c.oid) ~ 'auth\\.users'`);
  check(
    "nenhuma view de public referencia auth.users",
    viewsComAuthUsers.length === 0,
    viewsComAuthUsers.map((v) => v.viewname).join(", "),
  );

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

  const permPolicies = await q(`
    select count(*)::int as n from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%has_perm%'`);
  check(
    "policies migradas para has_perm()",
    (permPolicies[0]?.n as number) > 25,
    `${permPolicies[0]?.n} policies`,
  );

  // Nenhuma policy pode ter ficado no modelo antigo. Redundante com o `drop function` da
  // migration (que falharia antes de chegar aqui) e é isso que se quer: se alguém algum dia
  // remover o drop, esta asserção continua sendo a rede.
  const antigas = await q<{ tablename: string; policyname: string }>(`
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(is_portal_admin|is_portal_am|is_sm|is_member)\\('`);
  check(
    "nenhuma policy usa o modelo de papel antigo",
    antigas.length === 0,
    antigas.map((a) => `${a.tablename}.${a.policyname}`).join(", "),
  );

  // ⚠️ O QUE O `drop function` NÃO PROVA. O Postgres rastreia dependência de função usada em
  // expressão de POLICY, mas NÃO dentro de corpo `plpgsql` — o corpo é texto, resolvido em
  // runtime. Uma função que ainda chamasse `is_sm()` passaria pelo drop calada e só quebraria
  // quando alguém rodasse a jornada. Por isso a varredura é nos CORPOS.
  const corpos = await q<{ proname: string; achado: string }>(`
    select p.proname,
           (regexp_matches(pg_get_functiondef(p.oid),
             '(is_portal_admin|is_portal_am|is_sm|is_member)\\(', 'g'))[1] as achado
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'`);
  check(
    "nenhum corpo de função chama o modelo de papel antigo",
    corpos.length === 0,
    corpos.map((c) => `${c.proname} → ${c.achado}`).join(", "),
  );

  // O cabeçalho da migration afirma que ela é idempotente. Afirmação em comentário não
  // vale nada sem teste: `db push` pode reaplicar, e uma migration que só roda uma vez
  // deixa o banco a meio caminho na segunda tentativa.
  console.log("\nIdempotência (aplicar 2ª vez):");
  // Guardado ANTES da reaplicação: o rename `admin` → `admin_geral` da migration de RBAC é
  // destrutivo se rodar duas vezes (promoveria Admin operacional a Admin Geral), e o gate que
  // o impede é a FK. Reaplicar "sem erro" não bastaria — precisa ser sem EFEITO.
  await db.query(
    `insert into portal_roles (email, role) values ('idem-admin@lm.test','admin')
       on conflict do nothing`,
  );

  // Reaplica as DUAS migrations da rodada de RBAC, não só a última do diretório. A que carrega
  // o risco destrutivo (o rename `admin` → `admin_geral`) é a do modelo; se o teste seguisse
  // apenas `NEWEST_MIGRATION`, acrescentar qualquer migration nova depois dela apagaria em
  // silêncio a única verificação desse risco.
  let reapplied = true;
  let reapplyError = "";
  for (const file of [RBAC_MIGRATION, NEWEST_MIGRATION]) {
    try {
      await db.exec(migrationSql(file));
    } catch (e) {
      reapplied = false;
      reapplyError = `${file}: ${e instanceof Error ? e.message : String(e)}`;
      await db.exec("rollback").catch(() => undefined);
      break;
    }
  }
  check(`${RBAC_MIGRATION} e ${NEWEST_MIGRATION} reaplicam sem erro`, reapplied, reapplyError);

  if (reapplied) {
    const ainda = await q<{ role: string }>(
      `select role from portal_roles where email = 'idem-admin@lm.test'`,
    );
    check(
      "reaplicar NÃO promove Admin a Admin Geral (gate da FK)",
      ainda[0]?.role === "admin",
      `virou ${ainda[0]?.role}`,
    );
  }

  console.log(failed === 0 ? "\nSchema OK.\n" : `\n${failed} verificações falharam.\n`);
  process.exit(failed === 0 ? 0 : 1);
}
