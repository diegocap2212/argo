import type { DashboardItem } from '../types/jira';
import { matchesTeam, type SMConfig } from '../config/sm-config';
import { computeTeamPerformance } from './computeTeamPerformance';
import { assessTeamHealth, type TeamHealthStatus } from './health';
import type { PerformancePeriod, TeamPerformanceSnapshot } from './types';

/**
 * Comparativo da torre: agrega os times de cada agilista num snapshot de nível SM
 * (juntando os itens dos times dele, como o /sm faz) e também classifica cada time
 * pelo agilista dono. Alimenta os rankings SM×SM e time×time da home.
 */

export type MetricDirection = 'higher' | 'lower' | 'neutral';

export interface ComparisonMetric {
  key: string;
  label: string;
  unit: string;
  direction: MetricDirection; // 'lower' = menor é melhor (lead time, envelhecidos)
  get: (snapshot: TeamPerformanceSnapshot) => number | null;
}

export const COMPARISON_METRICS: ComparisonMetric[] = [
  { key: 'throughput', label: 'Vazão', unit: '', direction: 'higher', get: s => s.delivery.throughput },
  { key: 'leadTimeP85', label: 'Lead Time P85', unit: 'd', direction: 'lower', get: s => s.delivery.leadTimeP85 },
  { key: 'cycleTimeP85', label: 'Cycle Time P85', unit: 'd', direction: 'lower', get: s => s.delivery.cycleTimeP85 },
  { key: 'wip', label: 'WIP', unit: '', direction: 'neutral', get: s => s.flow.wip },
  { key: 'flowBalance', label: 'Saldo de fluxo', unit: '', direction: 'neutral', get: s => s.flow.flowBalance },
  { key: 'agingItems', label: 'Itens envelhecidos', unit: '', direction: 'lower', get: s => s.flow.agingItems },
  { key: 'predictability', label: 'Previsibilidade', unit: '%', direction: 'higher', get: s => s.predictability.rate },
  { key: 'storyPoints', label: 'Cobertura de SP', unit: '%', direction: 'higher', get: s => s.quality.storyPointsCoverage },
];

/** Paleta de identidade dos agilistas (distinta da semântica de saúde). */
export const SM_COLORS = ['#1FD75F', '#7566FF', '#E8A317', '#3B82F6', '#EC4899', '#14B8A6'];
const NO_SM_COLOR = '#82928A';

export interface SMComparisonEntry {
  id: string;
  name: string;
  avatar: string;
  color: string;
  snapshot: TeamPerformanceSnapshot;
  health: TeamHealthStatus;
  teamCount: number;
}

export interface TeamComparisonEntry {
  teamId: string;
  smId: string | null;
  smName: string;
  color: string;
  snapshot: TeamPerformanceSnapshot;
  health: TeamHealthStatus;
}

export interface SMComparison {
  sms: SMComparisonEntry[];
  teams: TeamComparisonEntry[];
}

export function computeSMComparison(
  items: readonly DashboardItem[],
  teams: readonly TeamPerformanceSnapshot[],
  smConfigs: readonly SMConfig[],
  period: PerformancePeriod,
  now: Date = new Date(),
): SMComparison {
  const colorFor = new Map<string, string>();
  smConfigs.forEach((sm, index) => colorFor.set(sm.id, SM_COLORS[index % SM_COLORS.length]));

  const sms: SMComparisonEntry[] = [];
  for (const sm of smConfigs) {
    const smItems = items.filter(item => sm.teams.some(cfg => matchesTeam(item.Team.trim(), cfg)));
    if (smItems.length === 0) continue;
    const snapshot = computeTeamPerformance(smItems, { teamId: sm.id, period, now });
    const teamCount = new Set(smItems.map(item => item.Team.trim()).filter(Boolean)).size;
    sms.push({
      id: sm.id, name: sm.name, avatar: sm.avatar, color: colorFor.get(sm.id) as string,
      snapshot, health: assessTeamHealth(snapshot).status, teamCount,
    });
  }

  const teamEntries: TeamComparisonEntry[] = teams.map(team => {
    const owner = smConfigs.find(sm => sm.teams.some(cfg => matchesTeam(team.teamId, cfg)));
    return {
      teamId: team.teamId,
      smId: owner?.id ?? null,
      smName: owner?.name ?? 'Sem agilista',
      color: owner ? (colorFor.get(owner.id) as string) : NO_SM_COLOR,
      snapshot: team,
      health: assessTeamHealth(team).status,
    };
  });

  return { sms, teams: teamEntries };
}

/** Ordena entradas por uma métrica, do melhor ao pior conforme a direção. Null vai para o fim. */
export function rankByMetric<T extends { snapshot: TeamPerformanceSnapshot }>(
  entries: readonly T[],
  metric: ComparisonMetric,
): T[] {
  return [...entries].sort((a, b) => {
    const va = metric.get(a.snapshot);
    const vb = metric.get(b.snapshot);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return metric.direction === 'lower' ? va - vb : vb - va;
  });
}
