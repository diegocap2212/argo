import type { TeamPerformanceSnapshot } from './types';

export type InsightSeverity = 'positive' | 'attention' | 'critical' | 'info';

export interface PerformanceInsight {
  id: string;
  teamId: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  metric: 'flow' | 'delivery' | 'aging' | 'quality' | 'predictability';
}

export function generateTeamInsights(
  current: TeamPerformanceSnapshot,
  previous?: TeamPerformanceSnapshot,
): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];
  const add = (insight: Omit<PerformanceInsight, 'teamId'>) => insights.push({ ...insight, teamId: current.teamId });

  if (current.flow.agingItems > 0) add({
    id: `${current.teamId}:aging`, severity: current.flow.agingItems >= 5 ? 'critical' : 'attention',
    title: `${current.flow.agingItems} ${current.flow.agingItems === 1 ? 'item envelhecido' : 'itens envelhecidos'} no WIP`,
    description: 'Itens em andamento há mais de 15 dias aumentam o risco de bloqueio e retrabalho.', metric: 'aging',
  });
  if (current.flow.flowBalance > Math.max(3, current.flow.outflow * 0.3)) add({
    id: `${current.teamId}:flow-balance`, severity: 'attention',
    title: `Entradas superam saídas em ${current.flow.flowBalance} itens`,
    description: `${current.flow.inflow} itens entraram e ${current.flow.outflow} foram concluídos no período.`, metric: 'flow',
  });
  if (current.delivery.leadTimeP85 !== null && current.delivery.leadTimeP85 > 20) add({
    id: `${current.teamId}:lead-time`, severity: current.delivery.leadTimeP85 > 30 ? 'critical' : 'attention',
    title: `Lead Time P85 em ${current.delivery.leadTimeP85} dias`,
    description: 'O tempo de entrega da maior parte dos itens está acima do limite de atenção de 20 dias.', metric: 'delivery',
  });
  if (current.quality.dataCoverage < 80 && current.delivery.throughput > 0) add({
    id: `${current.teamId}:coverage`, severity: 'attention',
    title: `Cobertura dos dados em ${current.quality.dataCoverage}%`,
    description: 'Datas essenciais ausentes reduzem a confiança das métricas e do futuro modelo de maturidade.', metric: 'quality',
  });
  if (current.predictability.rate !== null && current.predictability.rate < 70) add({
    id: `${current.teamId}:predictability`, severity: 'attention',
    title: `Previsibilidade em ${current.predictability.rate}%`,
    description: `${current.predictability.delivered} de ${current.predictability.committed} itens comprometidos foram entregues no período.`, metric: 'predictability',
  });
  if (previous && previous.delivery.throughput > 0) {
    const change = Math.round(((current.delivery.throughput - previous.delivery.throughput) / previous.delivery.throughput) * 100);
    if (Math.abs(change) >= 20) add({
      id: `${current.teamId}:throughput-trend`, severity: change > 0 ? 'positive' : 'attention',
      title: `Vazão ${change > 0 ? 'cresceu' : 'caiu'} ${Math.abs(change)}%`,
      description: `Comparação com o período anterior: ${previous.delivery.throughput} → ${current.delivery.throughput} entregas.`, metric: 'delivery',
    });
  }

  if (insights.length === 0) add({
    id: `${current.teamId}:stable`, severity: 'positive', title: 'Fluxo estável no período',
    description: 'Nenhuma regra de atenção foi acionada pelos indicadores disponíveis.', metric: 'flow',
  });
  return insights;
}

const severityOrder: Record<InsightSeverity, number> = { critical: 0, attention: 1, positive: 2, info: 3 };

export function generatePortfolioInsights(
  current: readonly TeamPerformanceSnapshot[],
  previous: readonly TeamPerformanceSnapshot[],
): PerformanceInsight[] {
  const previousByTeam = new Map(previous.map(team => [team.teamId, team]));
  return current
    .flatMap(team => generateTeamInsights(team, previousByTeam.get(team.teamId)))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.teamId.localeCompare(b.teamId, 'pt-BR'));
}
