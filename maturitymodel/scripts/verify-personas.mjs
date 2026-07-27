#!/usr/bin/env node
/**
 * "O que cada pessoa REALMENTE vê?" — respondido contra o banco de produção, com RLS de
 * verdade, sem escrever nada.
 *
 * COMO: a Management API roda como `postgres`, mas dentro de uma transação dá para
 * `set local role authenticated` + injetar `request.jwt.claims` — que é exatamente de onde
 * `auth.uid()` e `auth.jwt()` leem. A partir daí toda policy se aplica como se fosse a
 * requisição daquela pessoa. Tudo dentro de `begin … rollback`, então nada persiste.
 *
 * É o mesmo mecanismo do harness em PGlite (tests/pg/supabase-shim.ts), só que apontado
 * para os dados reais.
 *
 * O QUE ISTO PROVA: o escopo de leitura, os papéis e a fila de homologação de cada pessoa —
 * ou seja, os dados de que a home depende para decidir o que mostrar.
 * O QUE NÃO PROVA: a renderização em si (fonte, layout, se o texto faz sentido). Para isso
 * não há substituto para abrir a tela.
 *
 * Uso: SUPABASE_ACCESS_TOKEN=... node scripts/verify-personas.mjs <ref>
 */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.argv[2];

if (!token || !ref) {
  console.error("uso: SUPABASE_ACCESS_TOKEN=... node scripts/verify-personas.mjs <ref>");
  process.exit(2);
}

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

/** E-mail nunca sai inteiro no log: é PII e este script serve para colar em relatório. */
const mask = (e) => (e ? `${e.slice(0, 4)}***@${e.split("@")[1] ?? "?"}` : "?");

/** Roda a bateria como a pessoa, em transação revertida. */
async function asPerson(userId, email) {
  const claims = JSON.stringify({ sub: userId, email, role: "authenticated" });
  const rows = await sql(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', ${escapeLiteral(claims)}, true);
    select
      my_portal_roles()                                             as papeis,
      is_portal_am()                                                as e_am,
      is_portal_admin()                                             as e_admin,
      (select count(*)::int from teams)                             as squads_visiveis,
      (select count(*)::int from assessment_cycles)                 as ciclos_visiveis,
      (select count(*)::int from assessment_cycles
        where status = 'homologation')                              as fila_homologacao,
      (select count(*)::int from squad_members
        where user_id = ${escapeLiteral(userId)}::uuid
          and role = 'sm')                                          as squads_onde_e_sm,
      (select count(*)::int from profiles)                          as pessoas_no_diretorio,
      (select count(*)::int from kaizens)                           as kaizens_visiveis;
    rollback;`);
  return rows[0];
}

function escapeLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ── Descobre as personas reais ───────────────────────────────────────────────
const totals = (
  await sql(`select
    (select count(*)::int from teams)                                    as squads,
    (select count(*)::int from assessment_cycles)                        as ciclos,
    (select count(*)::int from assessment_cycles where status='homologation') as em_homologacao,
    (select count(*)::int from profiles)                                 as pessoas`)
)[0];

console.log(`\nProdução ${ref} — verdade absoluta (sem RLS):`);
console.log(`  ${totals.squads} squads · ${totals.ciclos} ciclos · ${totals.em_homologacao} em homologação · ${totals.pessoas} pessoas\n`);

const personas = await sql(`
  with papel as (
    select p.id, p.email,
           (select array_agg(pr.role order by pr.role) from portal_roles pr
             where pr.email = lower(p.email))                    as portal,
           exists(select 1 from squad_members sm
                   where sm.user_id = p.id and sm.role = 'sm')   as e_sm,
           exists(select 1 from squad_members sm
                   where sm.user_id = p.id)                      as e_membro
      from profiles p
     where p.email is not null
  )
  select id, email,
         case
           when 'admin' = any(portal) then 'admin'
           when 'am'    = any(portal) then 'AM'
           when e_sm                  then 'SM'
           when e_membro              then 'member'
           else 'sem vínculo'
         end as persona
    from papel
   order by case
     when 'admin' = any(portal) then 1
     when 'am'    = any(portal) then 2
     when e_sm                  then 3
     when e_membro              then 4
     else 5 end, email`);

// Uma pessoa por persona — a primeira de cada tipo.
const vistos = new Set();
const amostra = personas.filter((p) => {
  if (vistos.has(p.persona)) return false;
  vistos.add(p.persona);
  return true;
});

let problemas = 0;
const flag = (cond, msg) => {
  if (!cond) {
    problemas++;
    console.log(`      ⚠ ${msg}`);
  }
};

for (const p of amostra) {
  const r = await asPerson(p.id, p.email);
  console.log(`── ${p.persona.padEnd(12)} ${mask(p.email)}`);
  console.log(`   papéis do portal    : ${JSON.stringify(r.papeis)}`);
  console.log(`   squads visíveis     : ${r.squads_visiveis} de ${totals.squads}`);
  console.log(`   ciclos visíveis     : ${r.ciclos_visiveis} de ${totals.ciclos}`);
  console.log(`   fila de homologação : ${r.fila_homologacao}`);
  console.log(`   diretório de pessoas: ${r.pessoas_no_diretorio} de ${totals.pessoas}`);
  console.log(`   é SM de             : ${r.squads_onde_e_sm} squad(s)`);

  // Invariantes por persona — é aqui que o script vira teste, não relatório.
  if (p.persona === "admin") {
    flag(r.e_admin === true, "admin não é reconhecido como admin");
    flag(r.e_am === true, "admin deveria satisfazer is_portal_am()");
    flag(r.squads_visiveis === totals.squads, "admin não vê todos os squads");
  }
  if (p.persona === "AM") {
    flag(r.e_am === true, "AM não é reconhecido como AM");
    flag(r.e_admin === false, "AM aparece como ADMIN — escalação de privilégio!");
    flag(r.squads_visiveis === totals.squads, "AM não vê todos os squads (era o bug original)");
    flag(r.fila_homologacao === totals.em_homologacao, "AM não vê a fila de homologação inteira");
  }
  if (p.persona === "SM") {
    flag(r.e_am === false, "SM aparece como AM — escalação de privilégio!");
    flag(r.e_admin === false, "SM aparece como ADMIN — escalação de privilégio!");
    flag(r.squads_visiveis < totals.squads, "SM vê TODOS os squads — vazamento de escopo");
    flag(r.squads_onde_e_sm > 0, "SM não é SM de nenhum squad");
    flag(r.pessoas_no_diretorio < totals.pessoas, "SM vê o diretório inteiro — vazamento de PII");
  }
  if (p.persona === "member") {
    flag(r.e_am === false, "member aparece como AM");
    flag(r.squads_visiveis < totals.squads, "member vê TODOS os squads — vazamento de escopo");
    flag(r.pessoas_no_diretorio < totals.pessoas, "member vê o diretório inteiro — vazamento de PII");
  }
  if (p.persona === "sem vínculo") {
    flag(r.squads_visiveis === 0, "quem não tem vínculo nem papel está vendo squad");
    flag(r.pessoas_no_diretorio <= 1, "quem não tem vínculo vê mais que o próprio perfil");
  }
  console.log("");
}

console.log(problemas === 0 ? "✓ Nenhum problema de escopo.\n" : `⛔ ${problemas} problema(s).\n`);
process.exitCode = problemas === 0 ? 0 : 1;
