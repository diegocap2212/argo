import type { TeamPerformanceSnapshot } from './types';

export type TeamHealthStatus = 'healthy' | 'attention' | 'critical' | 'inactive';
export type TeamHealthRisk = 'aging' | 'leadTime' | 'flowBalance' | 'predictability';

export interface TeamHealthAssessment {
  status: TeamHealthStatus;
  risks: TeamHealthRisk[];
}

/**
 * Cortes AFROUXADOS temporariamente (2026-07-15): janela de release e times sob
 * pressão maior que o normal. Um único sinal = Atenção; 3+ = Crítico. Reapertar
 * quando a operação normalizar (voltar `leadTimeP85Days`, `agingShare`, etc.).
 *
 * Mudanças vs. versão rígida anterior:
 *  · aging: era "qualquer item >15d" (disparava em ~70% dos times) → agora exige
 *    envelhecidos > 40% do WIP E ao menos 5 itens.
 *  · leadTime: era P85 > 20d (absoluto, punia times bons) → agora > 45d.
 *  · flowBalance: era > max(3, saída×0,3) → agora > max(5, saída×0,5).
 *  · predictability: era < 70% → agora < 60%.
 *  · dataQuality: removido (flag morto — cobertura era 100% em todos).
 *  · "Sem dados": time sem entregas e sem WIP não é mais rotulado "Saudável".
 */
export const HEALTH_THRESHOLDS = {
  agingShare: 0.4,
  agingMinItems: 5,
  leadTimeP85Days: 45,
  flowBalanceFloor: 5,
  flowBalanceFactor: 0.5,
  predictabilityRate: 60,
  criticalRisks: 3,
};

export const HEALTH_LABELS: Record<TeamHealthStatus, string> = {
  critical: 'Crítico',
  attention: 'Atenção',
  healthy: 'Saudável',
  inactive: 'Sem dados',
};

export const HEALTH_CLASSES: Record<TeamHealthStatus, string> = {
  critical: 'critico',
  attention: 'atencao',
  healthy: 'saudavel',
  inactive: 'inativo',
};

export const HEALTH_ORDER: Record<TeamHealthStatus, number> = {
  critical: 0,
  attention: 1,
  healthy: 2,
  inactive: 3,
};

export const RISK_LABELS: Record<TeamHealthRisk, string> = {
  aging: 'Envelhecimento do WIP (>40% e ≥5 itens)',
  leadTime: 'Lead Time P85 alto (>45d)',
  flowBalance: 'Entra bem mais do que sai',
  predictability: 'Baixa previsibilidade (<60%)',
};

/** Crítico ou Atenção — usado para "times em atenção" (exclui Saudável e Sem dados). */
export function isUnhealthy(status: TeamHealthStatus): boolean {
  return status === 'critical' || status === 'attention';
}

/**
 * Classificação explicável: preserva os sinais separados (`risks`) em vez de
 * ocultá-los em uma média. A UI mostra os motivos e a legenda a partir de
 * RISK_LABELS/HEALTH_THRESHOLDS, então o critério fica claro para SM/time.
 */
export function assessTeamHealth(team: TeamPerformanceSnapshot): TeamHealthAssessment {
  // Time sem atividade no período não é "Saudável" — é ausência de dado.
  const active = team.delivery.throughput > 0 || team.flow.wip > 0;
  if (!active) return { status: 'inactive', risks: [] };

  const t = HEALTH_THRESHOLDS;
  const risks: TeamHealthRisk[] = [];

  const agingShare = team.flow.wip > 0 ? team.flow.agingItems / team.flow.wip : 0;
  if (team.flow.agingItems >= t.agingMinItems && agingShare > t.agingShare) risks.push('aging');
  if (team.delivery.leadTimeP85 !== null && team.delivery.leadTimeP85 > t.leadTimeP85Days) risks.push('leadTime');
  if (team.flow.flowBalance > Math.max(t.flowBalanceFloor, team.flow.outflow * t.flowBalanceFactor)) risks.push('flowBalance');
  if (team.predictability.rate !== null && team.predictability.rate < t.predictabilityRate) risks.push('predictability');

  const status: TeamHealthStatus = risks.length >= t.criticalRisks
    ? 'critical'
    : risks.length >= 1
      ? 'attention'
      : 'healthy';
  return { status, risks };
}
