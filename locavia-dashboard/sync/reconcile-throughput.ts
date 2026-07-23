import { startOfWeek, endOfWeek } from 'date-fns';
import data from '../src/data.json';
import type { DashboardItem } from '../src/types/jira';
import { computeTeamPerformance } from '../src/performance/computeTeamPerformance';

/**
 * Reconciliação de VAZÃO Dash × Jira, para diagnosticar por que a JQL semanal
 * não bate com o dashboard.
 *
 * Uso:  npx tsx sync/reconcile-throughput.ts <TIME> <YYYY-MM-DD>
 *   <TIME>: nome do time como no Dash (ex.: TIGUAN)
 *   <YYYY-MM-DD>: qualquer dia da semana desejada (a semana vai de segunda a domingo)
 *
 * Imprime: os itens que o Dash CONTA como entregues na semana (com Resolved) e os
 * "quase-contados" — itens que uma JQL por label/jornada pegaria, mas o Dash não,
 * porque o Time (cf11795) resolveu para outro squad / SEM TIME.
 *
 * Lê o dataset local (src/data.json). Não chama o Jira.
 */

const TERMINAL_DISCARDED = new Set(['CANCELADO', 'DESCARTADO']);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function main() {
  const team = process.argv[2];
  const dayArg = process.argv[3];
  if (!team || !dayArg) {
    console.error('Uso: npx tsx sync/reconcile-throughput.ts <TIME> <YYYY-MM-DD>');
    process.exit(1);
  }

  const items = data as unknown as DashboardItem[];
  const day = new Date(`${dayArg}T12:00:00Z`);
  const weekStart = startOfWeek(day, { weekStartsOn: 1 });
  const weekEndNatural = endOfWeek(day, { weekStartsOn: 1 });
  const weekEnd = new Date(weekEndNatural);
  weekEnd.setUTCHours(23, 59, 59, 999);

  console.log(`Time: ${team}`);
  console.log(`Semana: ${weekStart.toISOString().slice(0, 10)} → ${weekEndNatural.toISOString().slice(0, 10)} (seg–dom)\n`);

  const teamItems = items.filter(i => i.Team?.trim() === team);

  // Número oficial do Dash (mesma função do runtime).
  const snapshot = computeTeamPerformance(teamItems, {
    teamId: team,
    period: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
  });

  // Lista dos itens contados (replica o filtro delivered de computeTeamPerformance).
  const inPeriod = (d: Date | null) => d !== null && d >= weekStart && d <= weekEnd;
  const delivered = teamItems.filter(i =>
    i.StatusCategory === 'DONE' && !TERMINAL_DISCARDED.has(i.Status.toUpperCase()) && inPeriod(parseDate(i.Resolved)),
  );

  console.log(`✅ VAZÃO do Dash na semana: ${snapshot.delivery.throughput} (lista abaixo confere: ${delivered.length})`);
  delivered
    .sort((a, b) => (a.Resolved || '').localeCompare(b.Resolved || ''))
    .forEach(i => console.log(`   ${i.Key.padEnd(14)} ${i.Status.padEnd(22)} resolved=${(i.Resolved || '').slice(0, 10)}  ${i.Type}`));

  // ── Diagnóstico da divergência ──────────────────────────────────────────────
  console.log('\n── Por que uma JQL por label/jornada pode contar DIFERENTE ──');

  // (1) Itens que casam por label/jornada com o nome do time, mas foram atribuídos
  //     a OUTRO time (ou SEM TIME) → uma JQL por label os contaria, o Dash não.
  const teamUpper = team.toUpperCase();
  const nearMiss = items.filter(i =>
    i.Team?.trim() !== team &&
    i.StatusCategory === 'DONE' && !TERMINAL_DISCARDED.has(i.Status.toUpperCase()) && inPeriod(parseDate(i.Resolved)) &&
    ((i.Labels || []).some(l => l.toUpperCase() === teamUpper) || (i.Jornada || []).some(j => j.toUpperCase() === teamUpper)),
  );
  console.log(`(1) Entregues na semana que casam por label/jornada "${team}" mas o Dash atribuiu a OUTRO squad: ${nearMiss.length}`);
  nearMiss.slice(0, 20).forEach(i => console.log(`   ${i.Key.padEnd(14)} Team=${(i.Team || '').padEnd(16)} labels/jornada batem`));

  // (2) Itens do time DONE na semana mas descartados (CANCELADO/DESCARTADO) — o Dash não conta.
  const discarded = teamItems.filter(i =>
    TERMINAL_DISCARDED.has(i.Status.toUpperCase()) && inPeriod(parseDate(i.Resolved)),
  );
  console.log(`(2) Do time, resolvidos na semana mas CANCELADO/DESCARTADO (Dash não conta): ${discarded.length}`);

  // (3) Itens do time resolvidos na semana mas NÃO classificados como DONE (QA/homolog sem resolução etc.).
  const notDone = teamItems.filter(i =>
    i.StatusCategory !== 'DONE' && inPeriod(parseDate(i.Resolved)),
  );
  console.log(`(3) Do time, com Resolved na semana mas StatusCategory ≠ DONE: ${notDone.length}`);

  console.log('\nDica: compare a lista ✅ acima com o resultado da sua JQL semanal do Jira.');
  console.log('Os grupos (1)-(3) explicam as diferenças mais comuns. A JQL do Dash exclui ainda');
  console.log('épicos, subtarefas, cf[13065] não-vazio e Natureza=TESTES-LOCAVIA (ver sync-jira.ts).');
}

main();
