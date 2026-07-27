import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { endOfDayExclusiveUTC, previousPeriodOf } from '../performance/period';
import { computePerformancePortfolio } from '../performance/computePerformancePortfolio';
import { generatePortfolioInsights } from '../performance/insights';
import { fetchData } from '../services/dataService';
import type { DashboardItem } from '../types/jira';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../performance/trends';
import { computeAgingHeatmap, computeAttentionItems, computeLeadTimeScatter, computeStageDurations, computeThroughputVsLeadTime } from '../performance/analytics';
import { computeEpics } from '../performance/epics';
import { operationalItems } from '../performance/operational';

export function usePerformancePortfolio(days = 56) {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    fetchData()
      .then(data => { if (alive) setItems(operationalItems(data as unknown as DashboardItem[])); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // `end` EXCLUSIVO cobrindo o dia corrente inteiro (meia-noite UTC do dia seguinte). Mesma
  // convenção de useTeamPerformance: quem decide o limite é o chamador, e o cálculo não
  // estica mais nada por conta própria. Ver src/performance/period.ts.
  const period = useMemo(() => ({
    start: subDays(now, days).toISOString(),
    end: endOfDayExclusiveUTC(now).toISOString(),
  }), [now, days]);
  const portfolio = useMemo(
    () => computePerformancePortfolio(items, period, now),
    [items, period, now],
  );
  // Derivado, não montado à mão: o par montado fazia `previousPeriod.end === period.start`
  // com intervalo FECHADO nas duas pontas, e o dia da fronteira contava nos DOIS períodos —
  // inflando o delta de portfólio exibido na home executiva.
  const previousPeriod = useMemo(() => previousPeriodOf(period), [period]);
  const previousPortfolio = useMemo(
    () => computePerformancePortfolio(items, previousPeriod, now),
    [items, previousPeriod, now],
  );
  const insights = useMemo(
    () => generatePortfolioInsights(portfolio.teams, previousPortfolio.teams),
    [portfolio.teams, previousPortfolio.teams],
  );
  const trend = useMemo(() => computeWeeklyPerformanceTrend(items, period), [items, period]);
  const cfd = useMemo(() => computeCumulativeFlow(items, period), [items, period]);
  const aging = useMemo(() => computeAgingDistribution(items, now), [items, now]);
  const analysis = useMemo(() => ({
    scatter: computeLeadTimeScatter(items, period),
    throughputVsLead: computeThroughputVsLeadTime(trend),
    stages: computeStageDurations(items, period),
    heatmap: computeAgingHeatmap(items, portfolio.teams.map(t => t.teamId), now),
    attention: computeAttentionItems(items, now, 10),
  }), [items, period, trend, portfolio.teams, now]);

  const epics = useMemo(() => computeEpics(items, now), [items, now]);

  return { items, period, portfolio, previousPortfolio, insights, trend, cfd, aging, analysis, epics, now, loading, error };
}
