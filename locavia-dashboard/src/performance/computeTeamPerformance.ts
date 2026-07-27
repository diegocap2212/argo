import type { DashboardItem } from '../types/jira';
import type { PerformancePeriod, TeamPerformanceSnapshot } from './types';
import { isDiscardedStatus } from './discard';
import { makeInPeriod } from './period';

const DAY_MS = 86_400_000;

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

  // `period.end` é EXCLUSIVO e usado como veio. Este cálculo NÃO estende o limite.
  //
  // Antes havia `end.setUTCHours(23, 59, 59, 999)` aqui, com `isInPeriod` fechado nas duas
  // pontas. Como o `end` do período anterior coincide com o `start` do atual, esticar o fim
  // DENTRO do cálculo fazia o dia da fronteira cair nos dois períodos — inflando o delta
  // "vs. período anterior", que é o número que a home usa para dizer se o time melhorou.
  //
  // Quem decide "até onde vai o período" é o CHAMADOR, que é quem sabe a intenção: o hook
  // passa `endOfDayExclusiveUTC(now)` para incluir o dia corrente inteiro (o CLAUDE.md exige
  // o fechamento em UTC para não perder datas em fuso negativo). Esticar aqui e ali ao mesmo
  // tempo era a contagem dupla. Ver src/performance/period.ts.
  const endExclusive = end;
  const now = options.now ?? new Date();
  const agingThreshold = new Date(now.getTime() - (options.agingDays ?? 15) * DAY_MS);
  const isInPeriod = makeInPeriod(start, endExclusive);
  const isDiscarded = (item: DashboardItem) => isDiscardedStatus(item.Status);

  const delivered = items.filter(item =>
    item.StatusCategory === 'DONE' && !isDiscarded(item) && isInPeriod(parseDate(item.Resolved)),
  );
  // Descartados/cancelados não são "entrada" de trabalho — alinha com o gráfico semanal.
  const inflow = items.filter(item => !isDiscarded(item) && isInPeriod(parseDate(item.Created))).length;
  const activeAtEnd = items.filter(item => {
    const created = parseDate(item.Created);
    const resolved = parseDate(item.Resolved);
    // "Aberto no FIM do período", com o mesmo limite exclusivo do resto do cálculo: criado
    // antes do corte e não resolvido antes dele. Usar o `end` cru aqui e `endExclusive` no
    // `isInPeriod` faria WIP e vazão responderem a cortes diferentes no mesmo snapshot.
    return created !== null && created < endExclusive && (!resolved || resolved >= endExclusive);
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
