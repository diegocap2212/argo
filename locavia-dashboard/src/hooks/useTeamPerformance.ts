import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { computeTeamPerformance } from '../performance/computeTeamPerformance';
import { generateTeamInsights } from '../performance/insights';
import { fetchData } from '../services/dataService';
import type { DashboardItem } from '../types/jira';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../performance/trends';
import { computeAgingHeatmap, computeAttentionItems, computeLeadTimeScatter, computeStageDurations, computeThroughputVsLeadTime } from '../performance/analytics';

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

  const items = useMemo(
    () => allItems.filter(item => item.Team.trim() === teamId),
    [allItems, teamId],
  );
  const period = useMemo(() => ({ start: subDays(now, days).toISOString(), end: now.toISOString() }), [now, days]);
  const previousPeriod = useMemo(() => ({ start: subDays(now, days * 2).toISOString(), end: subDays(now, days).toISOString() }), [now, days]);
  const snapshot = useMemo(() => computeTeamPerformance(items, { teamId, period, now }), [items, teamId, period, now]);
  const previousSnapshot = useMemo(() => computeTeamPerformance(items, { teamId, period: previousPeriod, now }), [items, teamId, previousPeriod, now]);
  const insights = useMemo(() => generateTeamInsights(snapshot, previousSnapshot), [snapshot, previousSnapshot]);

  const trend = useMemo(() => computeWeeklyPerformanceTrend(items, period, now, teamId), [items, period, now, teamId]);
  const cfd = useMemo(() => computeCumulativeFlow(items, period), [items, period]);
  const aging = useMemo(() => computeAgingDistribution(items, now), [items, now]);
  const analysis = useMemo(() => ({
    scatter: computeLeadTimeScatter(items, period),
    throughputVsLead: computeThroughputVsLeadTime(trend),
    stages: computeStageDurations(items, period),
    heatmap: computeAgingHeatmap(items, [teamId], now),
    attention: computeAttentionItems(items, now, 8),
  }), [items, period, trend, teamId, now]);

  return { items, period, snapshot, previousSnapshot, insights, trend, cfd, aging, analysis, loading, error };
}
