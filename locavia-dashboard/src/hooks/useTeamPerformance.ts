import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { computeTeamPerformance } from '../performance/computeTeamPerformance';
import { generateTeamInsights } from '../performance/insights';
import { fetchData } from '../services/dataService';
import type { DashboardItem } from '../types/jira';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../performance/trends';
import { computeAgingHeatmap, computeAttentionItems, computeLeadTimeScatter, computeStageDurations, computeThroughputVsLeadTime } from '../performance/analytics';
import { computeEpics } from '../performance/epics';
import { operationalItems, isOperationalType, isOutrosThroughputType, teamShowsOutrosNaVazao } from '../performance/operational';

export function useTeamPerformance(teamId: string, days = 56) {
  const [allItems, setAllItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    fetchData()
      .then(data => { if (alive) setAllItems(data as unknown as DashboardItem[]); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // `items` = operacional (alimenta TODAS as métricas, como antes). O filtro saiu da
  // ingestão para `viewItems` poder incluir os "outros" só na vazão dos times opt-in.
  const items = useMemo(
    () => operationalItems(allItems).filter(item => item.Team.trim() === teamId),
    [allItems, teamId],
  );
  const outrosNaVazao = teamShowsOutrosNaVazao(teamId);
  // `viewItems` = base da "Vazão por tipo": para time opt-in, operacional + "outros" (exceto
  // Script Manual); senão, igual a `items`. NÃO alimenta snapshot/forecast/saúde.
  const viewItems = useMemo(
    () => outrosNaVazao
      ? allItems.filter(item => item.Team.trim() === teamId && (isOperationalType(item.Type) || isOutrosThroughputType(item.Type)))
      : items,
    [allItems, teamId, outrosNaVazao, items],
  );
  const period = useMemo(() => ({ start: subDays(now, days).toISOString(), end: now.toISOString() }), [now, days]);
  const previousPeriod = useMemo(() => ({ start: subDays(now, days * 2).toISOString(), end: subDays(now, days).toISOString() }), [now, days]);
  const snapshot = useMemo(() => computeTeamPerformance(items, { teamId, period, now }), [items, teamId, period, now]);
  const previousSnapshot = useMemo(() => computeTeamPerformance(items, { teamId, period: previousPeriod, now }), [items, teamId, previousPeriod, now]);
  const insights = useMemo(() => generateTeamInsights(snapshot, previousSnapshot), [snapshot, previousSnapshot]);

  const trend = useMemo(() => computeWeeklyPerformanceTrend(items, period), [items, period]);
  // Série só para a "Vazão por tipo": inclui os "outros" rotulados quando o time é opt-in.
  const viewTrend = useMemo(
    () => computeWeeklyPerformanceTrend(viewItems, period, { labelOutros: outrosNaVazao }),
    [viewItems, period, outrosNaVazao],
  );
  const cfd = useMemo(() => computeCumulativeFlow(items, period), [items, period]);
  const aging = useMemo(() => computeAgingDistribution(items, now), [items, now]);
  const analysis = useMemo(() => ({
    scatter: computeLeadTimeScatter(items, period),
    throughputVsLead: computeThroughputVsLeadTime(trend),
    stages: computeStageDurations(items, period),
    heatmap: computeAgingHeatmap(items, [teamId], now),
    attention: computeAttentionItems(items, now, 8),
  }), [items, period, trend, teamId, now]);

  const epics = useMemo(() => computeEpics(items, now), [items, now]);

  return { items, period, snapshot, previousSnapshot, insights, trend, viewTrend, outrosNaVazao, cfd, aging, analysis, epics, loading, error };
}
