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
import { readFileSync } from "node:fs";
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
const preSession = read("20260724130000_pre_session.sql");
const checkMatch = preSession.match(/check \(status in \(([^)]+)\)\)/);
if (!checkMatch) {
  console.error("Não achei o CHECK de status em 20260724130000_pre_session.sql.");
  process.exit(2);
}
const dbStatuses = [...checkMatch[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);

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
const roles = read("20260726120000_portal_roles.sql");
const trigger = roles.slice(roles.indexOf("function public.enforce_cycle_transition"));
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

// ── 4. Papéis: o TS não pode conhecer papel que o banco recusa ────────────────
console.log("\nPapéis:");
const squadRoleCheck = roles.match(/check \(role in \('sm','member'\)\)/);
check("squad_members.role no banco é ('sm','member')", !!squadRoleCheck);
const portalRoleCheck = roles.match(/check \(role in \('admin','am'\)\)/);
check("portal_roles.role no banco é ('admin','am')", !!portalRoleCheck);
check(
  "is_am(uuid) foi removida na migration",
  /drop function if exists is_am\(uuid\)/.test(roles),
);
check(
  "portal_admins foi removida na migration",
  /drop table if exists public\.portal_admins/.test(roles),
);

console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed === 0 ? 0 : 1);
