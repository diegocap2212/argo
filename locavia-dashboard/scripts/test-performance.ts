import assert from 'node:assert/strict';
import { computeTeamPerformance } from '../src/performance/computeTeamPerformance';
import { computePerformancePortfolio } from '../src/performance/computePerformancePortfolio';
import { generateTeamInsights } from '../src/performance/insights';
import { assessTeamHealth } from '../src/performance/health';
import { attachMaturity } from '../src/performance/maturity';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../src/performance/trends';
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
assert.equal(snapshot.flow.inflow, 4);
assert.equal(snapshot.flow.outflow, 2);
assert.equal(snapshot.flow.flowBalance, 2);
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
assert.deepEqual(assessTeamHealth(snapshot).risks, ['aging', 'predictability']);
const matureSnapshot = attachMaturity(snapshot, { level: 2, score: 68, dimensions: { fluxo: 72 } });
assert.equal(matureSnapshot.maturity?.dimensions.fluxo, 72);
assert.equal(snapshot.maturity, undefined);

const trend = computeWeeklyPerformanceTrend([
  item({ Key: 'TEAM-10', Type: 'Bug', Status: 'CONCLUÍDO', StatusCategory: 'DONE', Resolved: '2026-06-11T00:00:00Z', LeadTime: 10, StoryPoints: 3, CommitmentDate: '2026-06-02T00:00:00Z' }),
  item({ Key: 'TEAM-11', Created: '2026-06-10T00:00:00Z', CommitmentDate: null }),
], { start: '2026-06-01', end: '2026-06-30' }, new Date('2026-07-01T00:00:00Z'));
assert.ok(trend.some(point => point.throughput === 1));
assert.ok(trend.some(point => point.newItems === 1));
assert.ok(trend.some(point => point.unknownCommitment === 1));
assert.ok(trend.some(point => point.pointsDelivered === 3 && point.pointsCoverage === 100));
assert.ok(trend.some(point => point.byType.Bug === 1));

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

console.log('Performance snapshot: testes passaram.');
