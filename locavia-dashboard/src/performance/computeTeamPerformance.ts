import type { DashboardItem } from '../types/jira';
import type { PerformancePeriod, TeamPerformanceSnapshot } from './types';

const DAY_MS = 86_400_000;
const TERMINAL_DISCARDED = new Set(['CANCELADO', 'DESCARTADO']);

export interface TeamPerformanceOptions {
  teamId: string;
  period: PerformancePeriod;
  now?: Date;
  agingDays?: number;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function differenceInDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end || end < start) return null;
  return (end.getTime() - start.getTime()) / DAY_MS;
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

export function computeTeamPerformance(
  items: readonly DashboardItem[],
  options: TeamPerformanceOptions,
): TeamPerformanceSnapshot {
  const start = parseDate(options.period.start);
  const end = parseDate(options.period.end);
  if (!start || !end || end < start) throw new Error('Período de performance inválido.');

  // Períodos chegam como datas ISO; manter o fechamento em UTC evita perder o
  // último dia em fusos negativos (por exemplo, America/Sao_Paulo).
  end.setUTCHours(23, 59, 59, 999);
  const now = options.now ?? new Date();
  const agingThreshold = new Date(now.getTime() - (options.agingDays ?? 15) * DAY_MS);
  const isInPeriod = (date: Date | null) => date !== null && date >= start && date <= end;
  const isDiscarded = (item: DashboardItem) => TERMINAL_DISCARDED.has(item.Status.toUpperCase());

  const delivered = items.filter(item =>
    item.StatusCategory === 'DONE' && !isDiscarded(item) && isInPeriod(parseDate(item.Resolved)),
  );
  const inflow = items.filter(item => isInPeriod(parseDate(item.Created))).length;
  const activeAtEnd = items.filter(item => {
    const created = parseDate(item.Created);
    const resolved = parseDate(item.Resolved);
    return created !== null && created <= end && (!resolved || resolved > end);
  });
  const wipItems = activeAtEnd.filter(item => item.StatusCategory === 'IN_PROGRESS');

  const leadTimes = delivered
    .map(item => item.LeadTime ?? differenceInDays(parseDate(item.Created), parseDate(item.Resolved)))
    .filter((value): value is number => value !== null);
  const cycleTimes = delivered
    .map(item => differenceInDays(parseDate(item.StartDate), parseDate(item.Resolved)))
    .filter((value): value is number => value !== null);

  const committed = items.filter(item => isInPeriod(parseDate(item.CommitmentDate)));
  const committedDelivered = committed.filter(item =>
    item.StatusCategory === 'DONE' && !isDiscarded(item) && isInPeriod(parseDate(item.Resolved)),
  ).length;
  const storyPointsCoverage = delivered.length === 0
    ? 0
    : Math.round((delivered.filter(item => item.StoryPoints !== null).length / delivered.length) * 100);
  const coreDataCovered = delivered.filter(item =>
    Boolean(item.Team && parseDate(item.Created) && parseDate(item.Resolved)),
  ).length;
  const staleItems = activeAtEnd.filter(item => {
    const updated = parseDate(item.UpdatedAt);
    return updated !== null && updated < agingThreshold;
  }).length;
  const agingItems = wipItems.filter(item => {
    const started = parseDate(item.StartDate) ?? parseDate(item.Created);
    return started !== null && started < agingThreshold;
  }).length;

  return {
    teamId: options.teamId,
    period: options.period,
    delivery: {
      throughput: delivered.length,
      leadTimeAvg: rounded(leadTimes.length ? leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length : null),
      leadTimeP85: rounded(percentile(leadTimes, 0.85)),
      cycleTimeP85: rounded(percentile(cycleTimes, 0.85)),
    },
    flow: {
      wip: wipItems.length,
      inflow,
      outflow: delivered.length,
      flowBalance: inflow - delivered.length,
      agingItems,
    },
    predictability: {
      committed: committed.length,
      delivered: committedDelivered,
      rate: committed.length ? Math.round((committedDelivered / committed.length) * 100) : null,
    },
    quality: {
      staleItems,
      dataCoverage: delivered.length ? Math.round((coreDataCovered / delivered.length) * 100) : 0,
      storyPointsCoverage,
    },
  };
}
