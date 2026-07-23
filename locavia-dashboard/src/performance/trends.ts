import { addDays, endOfWeek, startOfWeek } from 'date-fns';
import type { DashboardItem } from '../types/jira';
import { isDiscardedStatus } from './discard';
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

const DAY_MS = 86_400_000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Percentil linear-interpolado — mesma fórmula de computeTeamPerformance/analytics.
function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function differenceInDays(startDate: Date | null, endDate: Date | null): number | null {
  if (!startDate || !endDate || endDate < startDate) return null;
  return (endDate.getTime() - startDate.getTime()) / DAY_MS;
}

export function computeWeeklyPerformanceTrend(
  items: readonly DashboardItem[],
  period: PerformancePeriod,
): PerformanceTrendPoint[] {
  const points: PerformanceTrendPoint[] = [];
  let week = startOfWeek(new Date(period.start), { weekStartsOn: 1 });
  const periodEnd = new Date(period.end);
  while (week <= periodEnd) {
    const naturalEnd = endOfWeek(week, { weekStartsOn: 1 });
    const weekEnd = naturalEnd > periodEnd ? periodEnd : naturalEnd;
    // Janela da semana [segunda 00:00, domingo 23:59:59.999] LOCAL, sem sobreposição
    // entre semanas — TODAS as métricas semanais usam este mesmo `inWeek` (a linha de
    // vazão e as barras "por tipo" derivam do MESMO conjunto `delivered`, então batem).
    const inWeek = (date: Date | null) => Boolean(date && date >= week && date <= weekEnd);
    const activeItems = items.filter(item => !isDiscardedStatus(item.Status));
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
    // Lead/Cycle time P85 da semana — sobre o MESMO `delivered` da vazão (sem sobreposição).
    const leadTimes = delivered
      .map(item => item.LeadTime ?? differenceInDays(parseDate(item.Created), parseDate(item.Resolved)))
      .filter((value): value is number => value !== null);
    const cycleTimes = delivered
      .map(item => differenceInDays(parseDate(item.StartDate), parseDate(item.Resolved)))
      .filter((value): value is number => value !== null);
    const leadP85 = percentile(leadTimes, 0.85);
    const cycleP85 = percentile(cycleTimes, 0.85);
    points.push({
      label: week.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      date: new Date(week),
      throughput: delivered.length,
      inflow: created.length,
      flowBalance: created.length - delivered.length,
      leadTimeP85: leadP85 === null ? null : Math.round(leadP85),
      cycleTimeP85: cycleP85 === null ? null : Math.round(cycleP85),
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
      if (isDiscardedStatus(item.Status)) continue;
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
