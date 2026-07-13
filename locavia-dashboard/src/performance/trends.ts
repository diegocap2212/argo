import { addDays, endOfWeek, startOfWeek } from 'date-fns';
import type { DashboardItem } from '../types/jira';
import { computeTeamPerformance } from './computeTeamPerformance';
import type { PerformancePeriod } from './types';

export interface PerformanceTrendPoint {
  label: string;
  date: Date;
  throughput: number;
  inflow: number;
  flowBalance: number;
  leadTimeP85: number | null;
  cycleTimeP85: number | null;
  newItems: number;
  plannedAtStart: number;
  unplannedIntake: number;
  unknownCommitment: number;
  deliveredPlanned: number;
  pointsCommitted: number;
  pointsDelivered: number;
  pointsCoverage: number;
  byType: Record<string, number>;
}

export interface CumulativeFlowPoint {
  label: string;
  date: Date;
  todo: number;
  inProgress: number;
  done: number;
}

export interface AgingBucket {
  label: string;
  count: number;
  severity: 'normal' | 'attention' | 'critical';
}

const discarded = new Set(['CANCELADO', 'DESCARTADO']);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeWeeklyPerformanceTrend(
  items: readonly DashboardItem[],
  period: PerformancePeriod,
  now: Date,
  scopeId = 'PORTFOLIO',
): PerformanceTrendPoint[] {
  const points: PerformanceTrendPoint[] = [];
  let week = startOfWeek(new Date(period.start), { weekStartsOn: 1 });
  const periodEnd = new Date(period.end);
  while (week <= periodEnd) {
    const naturalEnd = endOfWeek(week, { weekStartsOn: 1 });
    const weekEnd = naturalEnd > periodEnd ? periodEnd : naturalEnd;
    const snapshot = computeTeamPerformance(items, {
      teamId: scopeId,
      period: { start: week.toISOString(), end: weekEnd.toISOString() },
      now,
    });
    const inWeek = (date: Date | null) => Boolean(date && date >= week && date <= weekEnd);
    const activeItems = items.filter(item => !discarded.has(item.Status.toUpperCase()));
    const delivered = activeItems.filter(item => item.StatusCategory === 'DONE' && inWeek(parseDate(item.Resolved) ?? parseDate(item.UpdatedAt)));
    const created = activeItems.filter(item => inWeek(parseDate(item.Created)));
    const plannedAtStart = activeItems.filter(item => {
      const commitment = parseDate(item.CommitmentDate);
      const createdAt = parseDate(item.Created);
      const resolvedAt = parseDate(item.Resolved) ?? parseDate(item.UpdatedAt);
      return Boolean(commitment && commitment <= week && createdAt && createdAt <= week && (!resolvedAt || resolvedAt >= week));
    });
    const committedDuringWeek = activeItems.filter(item => inWeek(parseDate(item.CommitmentDate)));
    const deliveredPlanned = delivered.filter(item => {
      const commitment = parseDate(item.CommitmentDate);
      return Boolean(commitment && commitment <= week);
    });
    const withDeliveredPoints = delivered.filter(item => item.StoryPoints !== null);
    const byType = delivered.reduce<Record<string, number>>((totals, item) => {
      const type = normalizedType(item.Type);
      totals[type] = (totals[type] ?? 0) + 1;
      return totals;
    }, {});
    points.push({
      label: week.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      date: new Date(week),
      throughput: snapshot.delivery.throughput,
      inflow: snapshot.flow.inflow,
      flowBalance: snapshot.flow.flowBalance,
      leadTimeP85: snapshot.delivery.leadTimeP85,
      cycleTimeP85: snapshot.delivery.cycleTimeP85,
      newItems: created.length,
      plannedAtStart: plannedAtStart.length,
      unplannedIntake: committedDuringWeek.filter(item => {
        const commitment = parseDate(item.CommitmentDate);
        return commitment ? commitment.toDateString() !== week.toDateString() : false;
      }).length,
      unknownCommitment: created.filter(item => !parseDate(item.CommitmentDate)).length,
      deliveredPlanned: deliveredPlanned.length,
      pointsCommitted: plannedAtStart.reduce((sum, item) => sum + (item.StoryPoints ?? 0), 0),
      pointsDelivered: delivered.reduce((sum, item) => sum + (item.StoryPoints ?? 0), 0),
      pointsCoverage: delivered.length ? Math.round((withDeliveredPoints.length / delivered.length) * 100) : 0,
      byType,
    });
    week = addDays(week, 7);
  }
  return points;
}

function normalizedType(value: string): string {
  const type = value.trim().toLocaleLowerCase('pt-BR');
  if (type.includes('hist')) return 'História';
  if (type.includes('bug')) return 'Bug';
  if (type.includes('tarefa')) return 'Tarefa';
  if (type.includes('spike')) return 'Spike';
  return 'Outros';
}

export function computeAgingDistribution(items: readonly DashboardItem[], now: Date): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: '0–7d', count: 0, severity: 'normal' },
    { label: '8–14d', count: 0, severity: 'normal' },
    { label: '15–30d', count: 0, severity: 'attention' },
    { label: '31d+', count: 0, severity: 'critical' },
  ];
  for (const item of items) {
    if (item.StatusCategory !== 'IN_PROGRESS') continue;
    const started = parseDate(item.StartDate) ?? parseDate(item.Created);
    if (!started || started > now) continue;
    const age = Math.floor((now.getTime() - started.getTime()) / 86_400_000);
    const index = age <= 7 ? 0 : age <= 14 ? 1 : age <= 30 ? 2 : 3;
    buckets[index].count++;
  }
  return buckets;
}

/**
 * Reconstrução determinística do CFD com as datas disponíveis no snapshot Jira:
 * Created → TODO, StartDate → IN_PROGRESS e Resolved → DONE.
 */
export function computeCumulativeFlow(
  items: readonly DashboardItem[],
  period: PerformancePeriod,
): CumulativeFlowPoint[] {
  const points: CumulativeFlowPoint[] = [];
  let weekStart = startOfWeek(new Date(period.start), { weekStartsOn: 1 });
  const periodEnd = new Date(period.end);
  while (weekStart <= periodEnd) {
    const naturalEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const at = naturalEnd > periodEnd ? periodEnd : naturalEnd;
    let todo = 0;
    let inProgress = 0;
    let done = 0;
    for (const item of items) {
      if (discarded.has(item.Status.toUpperCase())) continue;
      const created = parseDate(item.Created);
      if (!created || created > at) continue;
      const started = parseDate(item.StartDate);
      const resolved = parseDate(item.Resolved);
      if (resolved && resolved <= at) done++;
      else if (started && started <= at) inProgress++;
      else todo++;
    }
    points.push({
      label: at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      date: new Date(at), todo, inProgress, done,
    });
    if (at.getTime() === periodEnd.getTime()) break;
    weekStart = addDays(weekStart, 7);
  }
  return points;
}
