#!/usr/bin/env node
/**
 * Runbook executável da migration de papéis (20260726120000_portal_roles.sql).
 *
 * Existe porque a verificação que protege as pessoas é NUMÉRICA: todo AM por squad tem de
 * virar AM global. Conferir isso à mão, depois de aplicar, é a hora errada de descobrir que
 * não fechou. Aqui a conferência é pré-condição e pós-condição, e o script RECUSA aplicar
 * se o cenário não for o esperado.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/apply-papeis.mjs <ref> --check   # só leitura
 *   SUPABASE_ACCESS_TOKEN=... node scripts/apply-papeis.mjs <ref> --apply   # aplica
 *
 * `--check` é seguro em produção e não escreve nada. Rode primeiro.
 *
 * A migration é atômica (`begin`/`commit` no arquivo, e a Management API honra controle
 * transacional — medido em 2026-07-26 com sonda de create/rollback). Se qualquer passo
 * falhar, nada é aplicado.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const [ref, mode] = process.argv.slice(2);

if (!token || !ref || !["--check", "--apply"].includes(mode ?? "")) {
  console.error("uso: SUPABASE_ACCESS_TOKEN=... node scripts/apply-papeis.mjs <ref> --check|--apply");
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = "20260726120000_portal_roles.sql";
const MIGRATION_PATH = join(HERE, "..", "supabase", "migrations", MIGRATION);

/** Versões aplicadas por SQL direto e nunca registradas no histórico — ver §histórico abaixo. */
const UNREGISTERED = [
  "20260713120000_neo_access_allowlist",
  "20260715120000_portal_admins_scoped_roles",
  "20260715150000_fix_sm_am_privilege_escalation",
  "20260723120000_qualidade_software",
  "20260724130000_pre_session",
  "20260726120000_portal_roles",
];

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
  return JSON.parse(body);
}

const one = async (q) => (await sql(q))[0];

// ── Pré-condições ───────────────────────────────────────────────────────────
console.log(`\nProjeto ${ref} · modo ${mode}\n`);

const pre = await one(`select
  (select count(distinct user_id)::int from squad_members where role='am')            as ams_por_squad,
  (select count(*)::int from squad_members)                                            as membros_total,
  (select count(*)::int from portal_admins)                                            as admins,
  (to_regclass('public.portal_roles') is not null)                                     as ja_aplicada,
  (select count(distinct sm.user_id)::int from squad_members sm
     left join profiles p on p.id = sm.user_id
    where sm.role='am' and (p.email is null or btrim(p.email)=''))                     as ams_orfaos`);

console.log("Antes:");
console.log(`  AMs por squad (pessoas distintas) : ${pre.ams_por_squad}`);
console.log(`  linhas em squad_members           : ${pre.membros_total}`);
console.log(`  portal_admins                     : ${pre.admins}`);
console.log(`  AMs sem e-mail em profiles        : ${pre.ams_orfaos}`);
console.log(`  portal_roles já existe            : ${pre.ja_aplicada}`);

if (pre.ja_aplicada) {
  console.log("\n⚠️  portal_roles já existe — a migration parece já aplicada.");
  console.log("    A migration é idempotente (testado), então reaplicar é seguro, mas");
  console.log("    a conferência numérica abaixo perde sentido: os papéis de squad já");
  console.log("    colapsaram e não há mais 'am' em squad_members para contar.");
}

// O freio: se houver AM sem e-mail, a migration aborta sozinha — mas é melhor descobrir
// aqui, com a lista em mãos, do que num erro de transação.
if (pre.ams_orfaos > 0) {
  const orfaos = await sql(`select sm.user_id, p.full_name
     from squad_members sm left join profiles p on p.id = sm.user_id
    where sm.role='am' and (p.email is null or btrim(p.email)='')`);
  console.error(`\n⛔ ${pre.ams_orfaos} AM(s) sem e-mail em profiles. Eles PERDERIAM o acesso.`);
  console.error("   Resolva antes (preencha o e-mail em profiles, ou adicione a pessoa");
  console.error("   manualmente em portal_roles depois de aplicar):");
  console.error(JSON.stringify(orfaos, null, 2));
  process.exit(1);
}

if (mode === "--check") {
  console.log("\n✓ Pré-condições OK. Nada foi escrito.");
  console.log(`  Ao aplicar, espere ${pre.ams_por_squad} linha(s) em portal_roles(role='am')`);
  console.log(`  e ${pre.admins} em portal_roles(role='admin').`);
  // `process.exit(0)` aqui derrubava o processo com asserção do libuv no Windows
  // (handle do fetch ainda aberto) e devolvia exit 127 — parecia falha sendo sucesso.
  // Sair pelo fim natural do módulo evita isso.
} else {
  await apply(pre);
}

// ── Aplicação ───────────────────────────────────────────────────────────────
async function apply(pre) {
console.log(`\nAplicando ${MIGRATION} …`);
await sql(readFileSync(MIGRATION_PATH, "utf8"));
console.log("aplicada.");

// ── Pós-condições ───────────────────────────────────────────────────────────
const post = await one(`select
  (select count(*)::int from portal_roles where role='am')                             as ams_globais,
  (select count(*)::int from portal_roles where role='admin')                          as admins,
  (select count(*)::int from squad_members)                                            as membros_total,
  (select count(*)::int from squad_members where role not in ('sm','member'))           as papeis_invalidos,
  (to_regclass('public.portal_admins') is null)                                        as portal_admins_removida,
  exists(select 1 from pg_proc where proname='is_portal_am')                            as fn_is_portal_am,
  exists(select 1 from pg_proc where proname='my_portal_roles')                         as fn_my_portal_roles,
  not exists(select 1 from pg_proc where proname='is_am')                                as is_am_removida,
  exists(select 1 from pg_trigger where tgname='cycle_transition_guard')                 as trigger_jornada,
  not exists(select 1 from pg_policies
              where tablename='profiles'
                and policyname='Authenticated users can view all profiles')             as vazamento_fechado,
  not exists(select 1 from pg_policies
              where schemaname='public' and cmd<>'SELECT'
                and (roles::text[] && array['public','anon']))                          as sem_escrita_anonima`);

const checks = [
  [`AMs por squad viraram AM global (${pre.ams_por_squad} → ${post.ams_globais})`, post.ams_globais === pre.ams_por_squad],
  [`admins preservados (${pre.admins} → ${post.admins})`, post.admins === pre.admins],
  [`nenhum vínculo de squad perdido (${pre.membros_total} → ${post.membros_total})`, post.membros_total === pre.membros_total],
  ["nenhum papel de squad fora de sm|member", post.papeis_invalidos === 0],
  ["portal_admins removida", post.portal_admins_removida],
  ["is_portal_am() criada", post.fn_is_portal_am],
  ["my_portal_roles() criada", post.fn_my_portal_roles],
  ["is_am(uuid) removida", post.is_am_removida],
  ["trigger da jornada instalado", post.trigger_jornada],
  ["vazamento do diretório de profiles fechado", post.vazamento_fechado],
  ["nenhuma policy de escrita para public/anon", post.sem_escrita_anonima],
];

console.log("\nDepois:");
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n⛔ ${failed} verificação(ões) falharam. A migration FOI aplicada (transação`);
  console.error("   confirmada). Para reverter, rode supabase/rollback/20260726120000_portal_roles_DOWN.sql");
  console.error("   e restaure squad_members do backup.");
  process.exit(1);
}

// ── Histórico de migrations ─────────────────────────────────────────────────
// As migrations de 13/07 em diante foram aplicadas por SQL direto (Management API) e nunca
// entraram em supabase_migrations.schema_migrations. Consequência: `supabase db push`
// tentaria reaplicar todas elas. Registrar aqui deixa o histórico honesto e o `db push`
// utilizável pela consultoria.
console.log("\nRegistrando no histórico de migrations:");
for (const v of UNREGISTERED) {
  const [version, ...nameParts] = v.split("_");
  await sql(`insert into supabase_migrations.schema_migrations (version, name)
             values ('${version}', '${nameParts.join("_")}')
             on conflict (version) do nothing`);
  console.log(`  ✓ ${version} ${nameParts.join("_")}`);
}

console.log("\n✓ Concluído. Próximo passo: regenerar src/integrations/supabase/types.ts e");
console.log("  deployar o front (a UI nova depende de my_portal_roles()).\n");
}
