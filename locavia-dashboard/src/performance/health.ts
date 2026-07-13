import type { TeamPerformanceSnapshot } from './types';

export type TeamHealthStatus = 'healthy' | 'attention' | 'critical';

export interface TeamHealthAssessment {
  status: TeamHealthStatus;
  risks: Array<'aging' | 'leadTime' | 'flowBalance' | 'dataQuality' | 'predictability'>;
}

/**
 * Classificação explicável: preserva os sinais separados em vez de ocultá-los
 * em uma média. O futuro modelo de maturidade pode substituir os limites sem
 * alterar o contrato consumido pela interface.
 */
export function assessTeamHealth(team: TeamPerformanceSnapshot): TeamHealthAssessment {
  const risks: TeamHealthAssessment['risks'] = [];
  if (team.flow.agingItems > 0) risks.push('aging');
  if (team.delivery.leadTimeP85 !== null && team.delivery.leadTimeP85 > 20) risks.push('leadTime');
  if (team.flow.flowBalance > Math.max(3, team.flow.outflow * 0.3)) risks.push('flowBalance');
  if (team.delivery.throughput > 0 && team.quality.dataCoverage < 80) risks.push('dataQuality');
  if (team.predictability.rate !== null && team.predictability.rate < 70) risks.push('predictability');
  return { status: risks.length >= 3 ? 'critical' : risks.length >= 1 ? 'attention' : 'healthy', risks };
}
