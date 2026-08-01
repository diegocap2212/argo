/**
 * Contrato entre a jornada do TypeScript e a jornada do BANCO.
 *
 * POR QUE ESTE ARQUIVO EXISTE: a máquina de estados do ciclo está escrita duas vezes —
 * `CYCLE_TRANSITIONS`/`CYCLE_JOURNEY` em src/types/mma.ts (o que a UI oferece) e o trigger
 * `cycle_transition_guard` na migration (o que o banco aceita). Duplicação imposta pelo
 * runtime: o navegador não executa plpgsql e o Postgres não importa TypeScript.
 *
 * A divergência não é hipotética. `pre_session` entrou no banco em 24/07 e ficou FORA do
 * array da home, então `findIndex` devolvia -1 e um ciclo em pré-sessão aparecia como
 * "Sessão". O `Record<CycleStatus, …>` do SquadSwitcher também estava preso ao modelo
 * anterior (`voting`/`workshop`/`proposed`) e ninguém viu — porque o script `typecheck`
 * é um no-op (tsconfig.json com `files: []` + `references`, e `tsc --noEmit` sem
 * `--build` não compila nada).
 *
 * Este teste NÃO precisa de banco: lê o SQL como texto. Roda em qualquer máquina e no CI.
 *
 * Uso: npx tsx tests/journey-contract.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CYCLE_JOURNEY,
  CYCLE_ORDER,
  CYCLE_TRANSITIONS,
  journeyStepOf,
  squadRouteFor,
  type CycleStatus,
} from "../src/types/mma.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "supabase", "migrations");
const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8");

/**
 * A ÚLTIMA migration que define algo — e por que este helper existe.
 *
 * Este teste lia `20260726120000_portal_roles.sql` por NOME, cravado em três lugares. Quando
 * `20260731120000_neo_rbac.sql` reescreveu `enforce_cycle_transition()` e trocou o CHECK de
 * `portal_roles.role` por uma FK, o teste continuou VERDE — validando a versão morta do
 * trigger e afirmando um CHECK que não existe mais. 21 asserções passando, zero medindo o
 * banco vivo.
 *
 * É o mesmo modo de falha que o `typecheck` no-op descrito no topo deste arquivo: teste verde
 * que não guarda nada treina o time a confiar nele. Ler sempre a definição MAIS RECENTE faz o
 * contrato seguir o banco automaticamente — a próxima migration não reabre este buraco.
 */
function latestDefining(pattern: RegExp, oQue: string): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse();
  for (const file of files) {
    const sql = read(file);
    if (pattern.test(sql)) return { file, sql };
  }
  console.error(`Nenhuma migration define ${oQue} (padrão ${pattern}).`);
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}
const setOf = (xs: readonly string[]) => [...new Set(xs)].sort().join(",");

// ── 1. Os status que o BANCO aceita (CHECK constraint) ─────────────────────────
const statusSrc = latestDefining(/check \(status in \(/, "o CHECK de assessment_cycles.status");
const checkMatch = statusSrc.sql.match(/check \(status in \(([^)]+)\)\)/);
if (!checkMatch) {
  console.error(`Não achei o CHECK de status em ${statusSrc.file}.`);
  process.exit(2);
}
const dbStatuses = [...checkMatch[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
console.log(`  (CHECK de status lido de ${statusSrc.file})`);

console.log("\nJornada: TypeScript × banco\n");
console.log("Cobertura de status:");
check(
  "CYCLE_JOURNEY cobre exatamente os status do CHECK do banco",
  setOf(CYCLE_ORDER) === setOf(dbStatuses),
  `ts=[${setOf(CYCLE_ORDER)}] sql=[${setOf(dbStatuses)}]`,
);
check(
  "cada status aparece em UM passo da jornada (sem duplicata)",
  new Set(CYCLE_ORDER).size === CYCLE_JOURNEY.length,
);
check(
  "CYCLE_TRANSITIONS tem uma entrada por status",
  setOf(Object.keys(CYCLE_TRANSITIONS)) === setOf(dbStatuses),
);
check(
  "todo destino de CYCLE_TRANSITIONS é um status válido",
  Object.values(CYCLE_TRANSITIONS)
    .flat()
    .every((s) => dbStatuses.includes(s)),
);

// ── 2. journeyStepOf e squadRouteFor são totais ────────────────────────────────
console.log("\nFunções totais (nenhum -1, nenhuma rota vazia):");
check(
  "journeyStepOf devolve índice válido para todo status",
  dbStatuses.every((s) => {
    const i = journeyStepOf(s as CycleStatus);
    return i >= 0 && i < CYCLE_JOURNEY.length;
  }),
);
check("journeyStepOf(null) não estoura", journeyStepOf(null) === 0);
check(
  "squadRouteFor devolve rota para todo status e para null",
  [...dbStatuses, null].every((s) => /^\/s\/T(\/|$)/.test(squadRouteFor("T", s as CycleStatus | null))),
);

// ── 3. O trigger do banco aceita exatamente as mesmas transições ───────────────
// Extrai os pares (old → new) do corpo de enforce_cycle_transition().
const triggerSrc = latestDefining(
  /function public\.enforce_cycle_transition/,
  "enforce_cycle_transition()",
);
const trigger = triggerSrc.sql.slice(
  triggerSrc.sql.indexOf("function public.enforce_cycle_transition"),
);
console.log(`  (trigger lido de ${triggerSrc.file})`);
const sqlTransitions = new Map<string, Set<string>>();
for (const m of trigger.matchAll(
  /old\.status = '([a-z_]+)' and new\.status (?:= '([a-z_]+)'|in \(([^)]+)\))/g,
)) {
  const from = m[1]!;
  const targets = m[2] ? [m[2]] : [...m[3]!.matchAll(/'([a-z_]+)'/g)].map((t) => t[1]!);
  sqlTransitions.set(from, new Set([...(sqlTransitions.get(from) ?? []), ...targets]));
}

console.log("\nTrigger cycle_transition_guard × CYCLE_TRANSITIONS:");
check("o trigger foi encontrado e tem transições", sqlTransitions.size > 0, `${sqlTransitions.size} origens`);

for (const [from, targets] of Object.entries(CYCLE_TRANSITIONS)) {
  if (targets.length === 0) {
    // 'archived' é terminal: o trigger não deve ter ramo para ele — cai no `else` e é
    // recusado, que é o comportamento correto.
    check(`${from} é terminal nos dois lados`, !sqlTransitions.has(from));
    continue;
  }
  const sql = sqlTransitions.get(from);
  check(
    `${from} → ${targets.join("|")} idêntico no trigger`,
    !!sql && setOf(targets) === setOf([...sql]),
    sql ? `ts=[${setOf(targets)}] sql=[${setOf([...sql])}]` : "origem ausente no trigger",
  );
}

// O inverso: nada no trigger que a UI não conheça.
for (const from of sqlTransitions.keys()) {
  check(
    `o trigger não aceita origem desconhecida: ${from}`,
    Object.prototype.hasOwnProperty.call(CYCLE_TRANSITIONS, from),
  );
}

/**
 * O reinício (qualquer status → pre_session) é o `restart_assessment`, e no trigger ele NÃO é
 * um par (old → new): é um ramo sobre `new.status` sozinho, invisível para o parser acima.
 *
 * Ele fica FORA de CYCLE_TRANSITIONS de propósito — a UI não oferece "voltar para a
 * pré-sessão" como passo da jornada, é ação destrutiva de administração. Mas se o ramo
 * desaparecer do trigger, o reinício perde a checagem de permissão e nada mais acusaria.
 */
check(
  "o trigger tem o ramo do reinício (qualquer → pre_session), com permissão",
  /if new\.status = 'pre_session' then/.test(trigger) &&
    /mma\.cycle\.restart/.test(trigger),
  "sem este ramo o restart_assessment fica sem guarda de permissão no banco",
);

// ── 4. Papéis: o TS não pode conhecer papel que o banco recusa ────────────────
//
// Esta seção lia o CHECK `role in ('admin','am')` de portal_roles. O RBAC substituiu esse
// CHECK por uma FK para `neo_roles`, então a fonte da verdade dos papéis virou o SEED daquela
// tabela — é lá que se lê quais existem, qual é global e qual pode ser concedido.
console.log("\nPapéis:");

const mma = readFileSync(join(HERE, "..", "src", "types", "mma.ts"), "utf8");
/** Extrai os membros de uma união de string literals do TS: `export type X = "a" | "b";` */
function tsUnion(nome: string): string[] {
  const m = mma.match(new RegExp(`export type ${nome} =([^;]+);`));
  if (!m) {
    console.error(`Não achei \`export type ${nome}\` em src/types/mma.ts.`);
    process.exit(2);
  }
  return [...m[1]!.matchAll(/"([a-z_]+)"/g)].map((x) => x[1]!);
}

// ── papel de SQUAD: continua sendo CHECK, e é ele que impede a escalação SM→AM ──
const squadSrc = latestDefining(/check \(role in \('sm','member'\)\)/, "o CHECK de squad_members.role");
check(`squad_members.role no banco é ('sm','member') (${squadSrc.file})`, true);
check(
  "type Role do TS == papéis de squad do banco",
  setOf(tsUnion("Role")) === setOf(["sm", "member"]),
  `ts=[${setOf(tsUnion("Role"))}] sql=[member,sm]`,
);

// ── papel GLOBAL: agora vem do seed de neo_roles ──
const rolesSrc = latestDefining(/insert into public\.neo_roles/, "o seed de neo_roles");
const seedBlock = rolesSrc.sql.slice(rolesSrc.sql.indexOf("insert into public.neo_roles"));
// Cada linha do seed é `('id', 'label', 'desc…', 'escopo', rank, grantable)`. O que interessa
// é id + escopo + grantable; o rótulo e a descrição são texto livre com vírgulas e acentos.
const seeded = [
  ...seedBlock.matchAll(/\(\s*'([a-z_]+)',[\s\S]*?'(global|squad)',\s*\d+,\s*(true|false)\s*\)/g),
].map((m) => ({ id: m[1]!, scope: m[2]!, grantable: m[3]! === "true" }));

check("o seed de neo_roles foi encontrado e tem 6 papéis", seeded.length === 6, `${seeded.length}`);
check(
  "os papéis de squad do seed batem com o CHECK",
  setOf(seeded.filter((r) => r.scope === "squad").map((r) => r.id)) === setOf(["sm", "member"]),
  `seed=[${setOf(seeded.filter((r) => r.scope === "squad").map((r) => r.id))}]`,
);

// A asserção que o modelo antigo não tinha como fazer: o TS conhece EXATAMENTE os papéis
// globais concedíveis. `admin_geral` existir no banco e não no tipo é como um papel que a
// tela de administração nunca oferece — e foi assim que `pre_session` sumiu da jornada.
const globaisConcediveis = seeded.filter((r) => r.scope === "global" && r.grantable).map((r) => r.id);
check(
  "type PortalRole do TS == papéis globais concedíveis do banco",
  setOf(tsUnion("PortalRole")) === setOf(globaisConcediveis),
  `ts=[${setOf(tsUnion("PortalRole"))}] sql=[${setOf(globaisConcediveis)}]`,
);
check(
  "o papel implícito NÃO é concedível (não pode aparecer em portal_roles)",
  seeded.some((r) => r.id === "todos" && !r.grantable),
);

// ── remoções do modelo antigo: fatos históricos, cada um na migration que o fez ──
check(
  "is_am(uuid) foi removida",
  /drop function if exists is_am\(uuid\)/.test(
    latestDefining(/drop function if exists is_am\(uuid\)/, "o drop de is_am(uuid)").sql,
  ),
);
check(
  "portal_admins foi removida",
  /drop table if exists public\.portal_admins/.test(
    latestDefining(/drop table if exists public\.portal_admins/, "o drop de portal_admins").sql,
  ),
);

console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed === 0 ? 0 : 1);
