import assert from 'node:assert/strict';
import { computeTeamPerformance } from '../src/performance/computeTeamPerformance';
import { computePerformancePortfolio } from '../src/performance/computePerformancePortfolio';
import { generateTeamInsights } from '../src/performance/insights';
import { assessTeamHealth } from '../src/performance/health';
import { attachMaturity } from '../src/performance/maturity';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../src/performance/trends';
import { computeAgingHeatmap, computeAttentionItems, computeLeadTimeScatter, computeStageDurations } from '../src/performance/analytics';
import { forecastHowMany, forecastWhen } from '../src/performance/montecarlo';
import { computeSMComparison, rankByMetric, COMPARISON_METRICS } from '../src/performance/smComparison';
import { isOperationalType, operationalItems } from '../src/performance/operational';
import type { SMConfig } from '../src/config/sm-config';
import type { DashboardItem } from '../src/types/jira';

function item(overrides: Partial<DashboardItem>): DashboardItem {
  return {
    Type: 'Story', Key: 'TEAM-1', Summary: 'Item de teste', Status: 'EM ANDAMENTO',
    StatusCategory: 'IN_PROGRESS', Team: 'TEAM', Created: '2026-06-01T00:00:00Z',
    Resolved: null, UpdatedAt: '2026-06-10T00:00:00Z', Release: 'LEGACY',
    StoryPoints: null, Priority: 'Medium', Assignee: null, Labels: [],
    CommitmentDate: null, StartDate: null, FuraFila: [], NaturezaDemanda: [],
    TimeInTodo: null, LeadTime: null, LeadTimeP85: null, LeadTimeP15: null,
    TimeInStatus: {}, IsPlanned: false,
    DataQuality: {
      missingResolutionDate: false, missingAssignee: false, noStatusTransitions: false,
      noSprint: false, staleTodo: false, suspiciouslyLongLead: false,
    },
    Source: 'api', ...overrides,
  };
}

const snapshot = computeTeamPerformance([
  item({
    Key: 'TEAM-1', Status: 'CONCLUÍDO', StatusCategory: 'DONE',
    Resolved: '2026-06-11T00:00:00Z', StartDate: '2026-06-06T00:00:00Z',
    LeadTime: 10, StoryPoints: 5, CommitmentDate: '2026-06-02T00:00:00Z',
  }),
  item({ Key: 'TEAM-2', Created: '2026-06-05T00:00:00Z', UpdatedAt: '2026-06-06T00:00:00Z' }),
  item({
    Key: 'TEAM-3', Status: 'CANCELADO', StatusCategory: 'TODO',
    Resolved: '2026-06-12T00:00:00Z', CommitmentDate: '2026-06-03T00:00:00Z',
  }),
  item({
    Key: 'TEAM-4', Status: 'CONCLUÍDO', StatusCategory: 'DONE',
    Created: '2026-06-29T00:00:00Z', Resolved: '2026-06-30T22:00:00Z', LeadTime: 2,
  }),
], {
  teamId: 'TEAM', period: { start: '2026-06-01', end: '2026-06-30' },
  now: new Date('2026-07-01T00:00:00Z'),
});

assert.equal(snapshot.delivery.throughput, 2);
assert.equal(snapshot.delivery.leadTimeP85, 9);
assert.equal(snapshot.delivery.cycleTimeP85, 5);
assert.equal(snapshot.flow.inflow, 3); // TEAM-3 (CANCELADO) não conta como entrada
assert.equal(snapshot.flow.outflow, 2);
assert.equal(snapshot.flow.flowBalance, 1);
assert.equal(snapshot.flow.wip, 1);
assert.equal(snapshot.predictability.committed, 2);
assert.equal(snapshot.predictability.delivered, 1);
assert.equal(snapshot.predictability.rate, 50);
assert.equal(snapshot.quality.storyPointsCoverage, 50);
assert.equal(snapshot.quality.staleItems, 1);
assert.throws(() => computeTeamPerformance([], {
  teamId: 'TEAM', period: { start: '2026-07-01', end: '2026-06-01' },
}), /inválido/);

const portfolio = computePerformancePortfolio([
  item({ Team: 'BETA', Key: 'BETA-1' }),
  item({ Team: 'ALFA', Key: 'ALFA-1' }),
  item({ Team: '', Key: 'UNKNOWN-1' }),
], { start: '2026-06-01', end: '2026-06-30' }, new Date('2026-07-01T00:00:00Z'));
assert.deepEqual(portfolio.teams.map(team => team.teamId), ['ALFA', 'BETA']);
assert.equal(portfolio.totals.teams, 2);
assert.equal(portfolio.totals.wip, 2);

const insightIds = generateTeamInsights(snapshot).map(insight => insight.id);
assert.ok(insightIds.includes('TEAM:aging'));
assert.ok(insightIds.includes('TEAM:predictability'));
// Critério afrouxado (2026-07-15): aging exige ≥5 itens e >40% do WIP, então este
// fixture (1 item envelhecido) não acende mais 'aging' — só 'predictability' (50<60).
assert.deepEqual(assessTeamHealth(snapshot).risks, ['predictability']);
const matureSnapshot = attachMaturity(snapshot, { level: 2, score: 68, dimensions: { fluxo: 72 } });
assert.equal(matureSnapshot.maturity?.dimensions.fluxo, 72);
assert.equal(snapshot.maturity, undefined);

const trend = computeWeeklyPerformanceTrend([
  item({ Key: 'TEAM-10', Type: 'Bug', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: '2026-06-11T00:00:00Z', LeadTime: 10, StoryPoints: 3, CommitmentDate: '2026-06-02T00:00:00Z' }),
  item({ Key: 'TEAM-11', Created: '2026-06-10T00:00:00Z', CommitmentDate: null }),
], { start: '2026-06-01', end: '2026-06-30' });
assert.ok(trend.some(point => point.throughput === 1));
assert.ok(trend.some(point => point.newItems === 1));
assert.ok(trend.some(point => point.unknownCommitment === 1));
assert.ok(trend.some(point => point.pointsDelivered === 3 && point.pointsCoverage === 100));
assert.ok(trend.some(point => point.byType.Bug === 1));

// ── Regressão: bug de fronteira semanal (double-count) ──
// Item resolvido numa SEGUNDA (limite de semana) não pode ser contado em 2 semanas,
// e a linha de vazão deve bater com a soma das barras "por tipo" em TODA semana.
const boundaryTrend = computeWeeklyPerformanceTrend([
  item({ Key: 'BD-1', Type: 'Bug', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: '2026-06-08T19:00:00-03:00', LeadTime: 5 }),
], { start: '2026-06-01', end: '2026-06-30' });
for (const point of boundaryTrend) {
  const byTypeSum = Object.values(point.byType).reduce((a, b) => a + b, 0);
  assert.equal(point.throughput, byTypeSum, `semana ${point.label}: throughput ${point.throughput} != soma byType ${byTypeSum}`);
}
assert.equal(boundaryTrend.reduce((a, p) => a + p.throughput, 0), 1, 'item de fronteira contado em mais de uma semana');

// ── Regressão: descarte (variante) fora de entrega e de inflow ──
const discardSnap = computeTeamPerformance([
  item({ Key: 'DC-1', Status: 'DESCARTADOS', StatusCategory: 'TODO', Created: '2026-06-05T00:00:00Z', Resolved: '2026-06-10T00:00:00Z' }),
], { teamId: 'TEAM', period: { start: '2026-06-01', end: '2026-06-30' }, now: new Date('2026-07-01T00:00:00Z') });
assert.equal(discardSnap.flow.inflow, 0, 'variante de descarte nao deve contar como inflow');
assert.equal(discardSnap.delivery.throughput, 0);

const cfd = computeCumulativeFlow([
  item({ Key: 'TEAM-20', Created: '2026-06-01T00:00:00Z', StartDate: '2026-06-08T00:00:00Z' }),
  item({ Key: 'TEAM-21', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Created: '2026-06-01T00:00:00Z', StartDate: '2026-06-03T00:00:00Z', Resolved: '2026-06-12T00:00:00Z' }),
], { start: '2026-06-01', end: '2026-06-30' });
assert.equal(cfd.at(-1)?.inProgress, 1);
assert.equal(cfd.at(-1)?.done, 1);

const aging = computeAgingDistribution([
  item({ Key: 'TEAM-30', StartDate: '2026-06-25T00:00:00Z' }),
  item({ Key: 'TEAM-31', StartDate: '2026-05-20T00:00:00Z' }),
], new Date('2026-07-01T00:00:00Z'));
assert.deepEqual(aging.map(bucket => bucket.count), [1, 0, 0, 1]);

// ── Analytics (aba "Análise de Fluxo") ──
const analyticsPeriod = { start: '2026-06-01', end: '2026-06-30' };
const analyticsNow = new Date('2026-07-01T00:00:00Z');

// Cycle time por etapa: TimeInStatus em horas → dias por etapa.
const stages = computeStageDurations([
  item({ Key: 'ST-1', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: '2026-06-15T00:00:00Z', TimeInStatus: { Backlog: 24, Desenvolvimento: 48, QA: 12 } }),
], analyticsPeriod);
assert.equal(stages.find(s => s.stage === 'Backlog')?.avg, 1);          // 24h = 1d
assert.equal(stages.find(s => s.stage === 'Desenvolvimento')?.avg, 2);  // 48h = 2d
assert.equal(stages.find(s => s.stage === 'Homologação/Deploy')?.avg, 0);

// Dispersão de lead time: outlier acima do P85.
const scatter = computeLeadTimeScatter([
  item({ Key: 'SC-1', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: '2026-06-10T00:00:00Z', LeadTime: 5 }),
  item({ Key: 'SC-2', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: '2026-06-20T00:00:00Z', LeadTime: 40 }),
], analyticsPeriod);
assert.equal(scatter.points.length, 2);
assert.ok(scatter.points.some(point => point.key === 'SC-2' && point.outlier));

// Cards problemáticos: só WIP ≥ 15 dias, ordenado por idade.
const attention = computeAttentionItems([
  item({ Key: 'AT-1', StatusCategory: 'IN_PROGRESS', StartDate: '2026-05-25T00:00:00Z' }), // 37d → crítico
  item({ Key: 'AT-2', StatusCategory: 'IN_PROGRESS', StartDate: '2026-06-28T00:00:00Z' }), // 3d → filtrado
], analyticsNow, 5);
assert.equal(attention.length, 1);
assert.equal(attention[0].key, 'AT-1');
assert.equal(attention[0].severity, 'critical');

// Aging heatmap: WIP 31d+ cai na última faixa.
const heat = computeAgingHeatmap([
  item({ Key: 'HM-1', Team: 'ALFA', StatusCategory: 'IN_PROGRESS', StartDate: '2026-05-20T00:00:00Z' }),
], ['ALFA'], analyticsNow);
assert.equal(heat.length, 1);
assert.deepEqual(heat[0].buckets, [0, 0, 0, 1]);

// ── Monte Carlo (aba "Previsão") ──
// Vazão constante de 5/semana: entregar 10 itens leva exatamente 2 semanas; em 3 semanas, 15 itens.
const mcWhen = forecastWhen([5, 5, 5], 10, 2000);
assert.equal(mcWhen.p50, 2);
assert.equal(mcWhen.p85, 2);
assert.equal(mcWhen.p95, 2);
const mcMany = forecastHowMany([5, 5, 5], 3, 2000);
assert.equal(mcMany.p50, 15);
assert.equal(mcMany.p85, 15);
// Sem histórico (tudo zero) não trava nem inventa: retorna vazio.
assert.equal(forecastWhen([0, 0], 10, 100).trials, 0);
// Vazão variável mantém a ordem de confiança: 95% conservador ≥ 50% no tempo; ≤ 50% na quantidade.
const mcVar = forecastWhen([2, 6, 10], 20, 3000);
assert.ok(mcVar.p95 >= mcVar.p50);
const mcVarMany = forecastHowMany([2, 6, 10], 4, 3000);
assert.ok(mcVarMany.p95 <= mcVarMany.p50);

// ── Comparativo da torre (Home): SM × SM e time × time ──
const cmpPeriod = { start: '2026-06-01', end: '2026-06-30' };
const cmpNow = new Date('2026-07-01T00:00:00Z');
const done = (key: string, team: string, resolved: string, lead: number) =>
  item({ Key: key, Team: team, Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: resolved, LeadTime: lead });
const cmpItems = [
  // ANA: 2 times, 3 entregas
  done('ALFA-1', 'ALFA', '2026-06-10T00:00:00Z', 5),
  done('ALFA-2', 'ALFA', '2026-06-12T00:00:00Z', 7),
  done('BETA-1', 'BETA', '2026-06-15T00:00:00Z', 20),
  // BRUNO: 1 time, 1 entrega
  done('GAMA-1', 'GAMA', '2026-06-11T00:00:00Z', 3),
  // sem agilista
  done('ZETA-1', 'ZETA', '2026-06-11T00:00:00Z', 4),
];
const cmpConfigs: SMConfig[] = [
  { id: 'ana', name: 'Ana', avatar: 'AN', teams: [
    { carCode: 'ALFA', displayName: 'Alfa', teamFieldValues: ['ALFA'], keyPrefixes: ['ALFA'] },
    { carCode: 'BETA', displayName: 'Beta', teamFieldValues: ['BETA'], keyPrefixes: ['BETA'] },
  ] },
  { id: 'bruno', name: 'Bruno', avatar: 'BR', teams: [
    { carCode: 'GAMA', displayName: 'Gama', teamFieldValues: ['GAMA'], keyPrefixes: ['GAMA'] },
  ] },
];
const cmpPortfolio = computePerformancePortfolio(cmpItems, cmpPeriod, cmpNow);
const cmp = computeSMComparison(cmpItems, cmpPortfolio.teams, cmpConfigs, cmpPeriod, cmpNow);
// Dois agilistas com dados; Ana soma 3 entregas (2 times), Bruno 1 (1 time).
assert.equal(cmp.sms.length, 2);
const ana = cmp.sms.find(s => s.id === 'ana');
assert.equal(ana?.snapshot.delivery.throughput, 3);
assert.equal(ana?.teamCount, 2);
assert.equal(cmp.sms.find(s => s.id === 'bruno')?.snapshot.delivery.throughput, 1);
// Cada time recebe o dono correto; ZETA fica sem agilista.
assert.equal(cmp.teams.find(t => t.teamId === 'ALFA')?.smId, 'ana');
assert.equal(cmp.teams.find(t => t.teamId === 'ZETA')?.smId, null);
// Ranking de vazão (maior é melhor): Ana na frente de Bruno.
const throughput = COMPARISON_METRICS.find(m => m.key === 'throughput')!;
assert.deepEqual(rankByMetric(cmp.sms, throughput).map(s => s.id), ['ana', 'bruno']);
// Ranking de lead time (menor é melhor): Bruno (3) antes de Ana (P85 mais alto por causa do BETA-1=20).
const lead = COMPARISON_METRICS.find(m => m.key === 'leadTimeP85')!;
assert.equal(rankByMetric(cmp.sms, lead)[0].id, 'bruno');

// ── Escopo operacional: só US(História)/Task(Tarefa)/Bug/Spike entram nas métricas ──
assert.equal(isOperationalType('História'), true);
assert.equal(isOperationalType('Tarefa'), true);
assert.equal(isOperationalType('Bug'), true);
assert.equal(isOperationalType('Spike'), true);
assert.equal(isOperationalType('UAT'), false);
assert.equal(isOperationalType('Script Manual'), false);
assert.equal(isOperationalType('GMUD'), false);
const opFiltered = operationalItems([
  item({ Key: 'OP-1', Type: 'História' }),
  item({ Key: 'OP-2', Type: 'UAT' }),
  item({ Key: 'OP-3', Type: 'Script Manual' }),
  item({ Key: 'OP-4', Type: 'Bug' }),
]);
assert.deepEqual(opFiltered.map(i => i.Key), ['OP-1', 'OP-4']);

console.log('Performance snapshot: testes passaram.');
