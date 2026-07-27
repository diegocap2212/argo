import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computePerformancePortfolio } from '../src/performance/computePerformancePortfolio';
import { endOfDayExclusiveUTC } from '../src/performance/period';
import type { DashboardItem } from '../src/types/jira';

const items = JSON.parse(fs.readFileSync(new URL('../src/data.json', import.meta.url), 'utf-8')) as DashboardItem[];

/**
 * `now` fixável por env — sem isto esta auditoria NÃO SERVE de baseline.
 *
 * A janela é `now - 56 dias`, então ela desliza a cada execução: com o dataset congelado e o
 * código idêntico, medi 1198 às 06:00 UTC e 1187 às 18:00 do MESMO dia (itens resolvidos há 56
 * dias saem da janela conforme o tempo passa). Comparar dois números destes é comparar horários
 * de execução, não comportamento do código — foi o que quase me fez perseguir uma regressão de
 * 9 itens que não existia.
 *
 *   AUDIT_NOW=2026-07-27T12:00:00Z pnpm --filter locavia-dashboard audit:performance
 */
const now = process.env.AUDIT_NOW ? new Date(process.env.AUDIT_NOW) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`AUDIT_NOW inválido: ${process.env.AUDIT_NOW}`);
  process.exit(2);
}
// `end` EXCLUSIVO cobrindo o dia corrente, igual aos hooks da aplicação — a auditoria tem de
// medir a mesma janela que a UI mostra. Ver src/performance/period.ts.
const period = {
  start: new Date(now.getTime() - 56 * 86_400_000).toISOString(),
  end: endOfDayExclusiveUTC(now).toISOString(),
};
const portfolio = computePerformancePortfolio(items, period, now);

assert.ok(items.length > 0, 'Dataset vazio.');
assert.ok(portfolio.teams.length > 0, 'Nenhum time agregado.');
assert.equal(portfolio.totals.teams, portfolio.teams.length);
assert.equal(portfolio.totals.outflow, portfolio.totals.throughput);
assert.equal(portfolio.totals.flowBalance, portfolio.totals.inflow - portfolio.totals.outflow);
for (const team of portfolio.teams) {
  assert.ok(team.teamId.trim(), 'Snapshot sem time.');
  assert.ok(team.delivery.throughput >= 0 && team.flow.wip >= 0, `Métrica negativa em ${team.teamId}.`);
  assert.ok(team.quality.dataCoverage >= 0 && team.quality.dataCoverage <= 100, `Cobertura inválida em ${team.teamId}.`);
}

console.log(JSON.stringify({
  items: items.length,
  teams: portfolio.totals.teams,
  throughput: portfolio.totals.throughput,
  wip: portfolio.totals.wip,
  flowBalance: portfolio.totals.flowBalance,
}, null, 2));
