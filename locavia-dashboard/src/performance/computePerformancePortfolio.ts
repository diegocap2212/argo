import type { DashboardItem } from '../types/jira';
import { computeTeamPerformance } from './computeTeamPerformance';
import type { PerformancePeriod, TeamPerformanceSnapshot } from './types';

export interface PerformancePortfolio {
  period: PerformancePeriod;
  teams: TeamPerformanceSnapshot[];
  totals: {
    teams: number;
    throughput: number;
    wip: number;
    inflow: number;
    outflow: number;
    flowBalance: number;
    agingItems: number;
  };
}

export function computePerformancePortfolio(
  items: readonly DashboardItem[],
  period: PerformancePeriod,
  now: Date = new Date(),
): PerformancePortfolio {
  const byTeam = new Map<string, DashboardItem[]>();
  for (const item of items) {
    const teamId = item.Team.trim();
    if (!teamId) continue;
    const teamItems = byTeam.get(teamId) ?? [];
    teamItems.push(item);
    byTeam.set(teamId, teamItems);
  }

  const teams = Array.from(byTeam.entries())
    .map(([teamId, teamItems]) => computeTeamPerformance(teamItems, { teamId, period, now }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId, 'pt-BR'));

  return {
    period,
    teams,
    totals: teams.reduce((totals, team) => ({
      teams: totals.teams + 1,
      throughput: totals.throughput + team.delivery.throughput,
      wip: totals.wip + team.flow.wip,
      inflow: totals.inflow + team.flow.inflow,
      outflow: totals.outflow + team.flow.outflow,
      flowBalance: totals.flowBalance + team.flow.flowBalance,
      agingItems: totals.agingItems + team.flow.agingItems,
    }), { teams: 0, throughput: 0, wip: 0, inflow: 0, outflow: 0, flowBalance: 0, agingItems: 0 }),
  };
}
