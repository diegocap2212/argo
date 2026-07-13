import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computePerformancePortfolio } from '../src/performance/computePerformancePortfolio';
import type { DashboardItem } from '../src/types/jira';

const items = JSON.parse(fs.readFileSync(new URL('../src/data.json', import.meta.url), 'utf-8')) as DashboardItem[];
const now = new Date();
const period = {
  start: new Date(now.getTime() - 56 * 86_400_000).toISOString(),
  end: now.toISOString(),
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
