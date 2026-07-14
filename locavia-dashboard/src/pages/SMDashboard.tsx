import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SMConfig, TeamConfig } from '../config/sm-config';
import { teamLabel } from '../config/teamLabels';
import { usePerformancePortfolio } from '../hooks/usePerformancePortfolio';
import { assessTeamHealth, type TeamHealthStatus } from '../performance/health';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../performance/trends';
import { computeAgingHeatmap, computeAttentionItems, computeLeadTimeScatter, computeStageDurations, computeThroughputVsLeadTime } from '../performance/analytics';
import { type DashboardTab } from '../components/DashboardTabs';
import { AgingDistributionChart, CommitmentChart, CumulativeFlowChart, CycleTimeTrendChart, FlowVolumeChart, LeadTimeTrendChart, StoryPointsChart, TeamPerformanceComparisonChart, ThroughputByTypeChart, WeeklyIntakeChart } from '../components/PerformanceCharts';
import { AgingHeatmap, AttentionItemsList, LeadTimeScatterChart, StageBreakdownChart, ThroughputVsLeadTimeChart } from '../components/AnalysisCharts';
import '../styles/redesign.css';

interface Props { smConfig: SMConfig }

const PERIODS = [4, 8, 12, 16, 24];
const healthLabel: Record<TeamHealthStatus, string> = { healthy: 'Saudável', attention: 'Atenção', critical: 'Crítico' };
const healthClass: Record<TeamHealthStatus, string> = { healthy: 'saudavel', attention: 'atencao', critical: 'critico' };

function matchesTeam(teamId: string, config: TeamConfig): boolean {
  const value = teamId.toUpperCase();
  return value === config.carCode.toUpperCase()
    || config.teamFieldValues.some(candidate => {
      const normalized = candidate.toUpperCase();
      return value.includes(normalized) || normalized.includes(value);
    });
}

function ChartCard({ title, subtitle, wide, tall, children }: { title: string; subtitle?: string; wide?: boolean; tall?: boolean; children: React.ReactNode }) {
  return (
    <article className={`chart-card${wide ? ' wide' : ''}`}>
      <div className="card-heading"><div><h2>{title}</h2></div></div>
      {subtitle && <p className="sub">{subtitle}</p>}
      <div className={`chart-host${tall ? ' tall' : ''}`}>{children}</div>
    </article>
  );
}

export const SMDashboard: React.FC<Props> = ({ smConfig }) => {
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(8);
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [tab, setTab] = useState<DashboardTab>('overview');
  const { items, period, portfolio, insights, now, loading, error } = usePerformancePortfolio(weeks * 7);

  const teams = useMemo(() => portfolio.teams.filter(team => {
    const configs = selectedTeam === 'ALL' ? smConfig.teams : smConfig.teams.filter(config => config.carCode === selectedTeam);
    return configs.some(config => matchesTeam(team.teamId, config));
  }), [portfolio.teams, selectedTeam, smConfig.teams]);
  const teamIds = useMemo(() => new Set(teams.map(team => team.teamId)), [teams]);
  const scopedItems = useMemo(() => items.filter(item => teamIds.has(item.Team.trim())), [items, teamIds]);
  const trend = useMemo(() => computeWeeklyPerformanceTrend(scopedItems, period, now, smConfig.id), [scopedItems, period, now, smConfig.id]);
  const cfd = useMemo(() => computeCumulativeFlow(scopedItems, period), [scopedItems, period]);
  const aging = useMemo(() => computeAgingDistribution(scopedItems, now), [scopedItems, now]);
  const analysis = useMemo(() => ({
    scatter: computeLeadTimeScatter(scopedItems, period),
    throughputVsLead: computeThroughputVsLeadTime(trend),
    stages: computeStageDurations(scopedItems, period),
    heatmap: computeAgingHeatmap(scopedItems, [...teamIds], now),
    attention: computeAttentionItems(scopedItems, now, 10),
  }), [scopedItems, period, trend, teamIds, now]);
  const scopedInsights = insights.filter(insight => teamIds.has(insight.teamId));
  const pointsCoverage = Math.round(trend.filter(p => p.throughput > 0).reduce((s, p) => s + p.pointsCoverage, 0) / Math.max(trend.filter(p => p.throughput > 0).length, 1));
  const totals = teams.reduce((acc, team) => ({
    throughput: acc.throughput + team.delivery.throughput,
    wip: acc.wip + team.flow.wip,
    aging: acc.aging + team.flow.agingItems,
    attention: acc.attention + Number(assessTeamHealth(team).status !== 'healthy'),
  }), { throughput: 0, wip: 0, aging: 0, attention: 0 });

  return (
    <div className="rd">
      <div className="rd-main">
        <section className="page-head">
          <div className="ph-title">
            <span className="avatar">{smConfig.avatar}</span>
            <div>
              <span className="eyebrow">Portfólio · Agilista</span>
              <h1>{smConfig.name}</h1>
              <p>Performance consolidada dos times sob acompanhamento.</p>
            </div>
          </div>
          <div className="head-actions">
            <select className="rd-select" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} aria-label="Time">
              <option value="ALL">Todos os times</option>
              {smConfig.teams.map(team => <option key={team.carCode} value={team.carCode}>{team.displayName}</option>)}
            </select>
            <select className="rd-select" value={weeks} onChange={e => setWeeks(Number(e.target.value))} aria-label="Período em semanas">
              {PERIODS.map(w => <option key={w} value={w}>Últimas {w} semanas</option>)}
            </select>
          </div>
        </section>

        {loading ? <div className="rd-state">Carregando performance…</div>
          : error ? <div className="rd-state" style={{ color: 'var(--red)' }}>{error}</div>
          : (
            <>
              <section className="snapshot" style={{ marginTop: 36 }}>
                <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                  <article className="metric primary"><small>Entregas</small><strong>{totals.throughput}</strong><p>no período</p></article>
                  <article className="metric"><small>Times</small><strong>{teams.length}</strong><p>no portfólio</p></article>
                  <article className="metric"><small>WIP</small><strong>{totals.wip}</strong><p>em andamento</p></article>
                  <article className="metric warning"><small>Itens envelhecidos</small><strong>{totals.aging}</strong><p>há mais de 15 dias</p></article>
                  <article className="metric"><small>Times em atenção</small><strong>{totals.attention}</strong><p>com sinais ativos</p></article>
                </div>
              </section>

              <section>
                <div className="tabs">
                  {(['overview', 'flow', 'commitment', 'time', 'analysis'] as DashboardTab[]).map(id => (
                    <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                      {id === 'overview' ? 'Visão geral' : id === 'flow' ? 'Fluxo' : id === 'commitment' ? 'Compromisso' : id === 'time' ? 'Tempo' : 'Análise de Fluxo'}
                    </button>
                  ))}
                </div>

                {tab === 'overview' && (
                  <div className="chart-grid">
                    <ChartCard title="O que entrou e o que saiu" subtitle="Itens novos por semana comparados às entregas."><WeeklyIntakeChart data={trend} /></ChartCard>
                    <ChartCard title="Vazão e demanda" subtitle="Entradas × saídas por semana no contexto selecionado."><FlowVolumeChart data={trend} /></ChartCard>
                    <ChartCard title="Comparativo dos times" subtitle="Vazão em barras; Lead Time P85 na linha âmbar." wide tall><TeamPerformanceComparisonChart teams={teams} /></ChartCard>
                  </div>
                )}
                {tab === 'flow' && (
                  <div className="chart-grid">
                    <ChartCard title="CFD do portfólio" subtitle="Acúmulo e velocidade do fluxo dos times selecionados." wide tall><CumulativeFlowChart data={cfd} /></ChartCard>
                    <ChartCard title="Vazão por tipo" subtitle="Composição semanal das entregas por tipo."><ThroughputByTypeChart data={trend} /></ChartCard>
                    <ChartCard title="Aging do WIP" subtitle="Itens em andamento por faixa de envelhecimento."><AgingDistributionChart data={aging} /></ChartCard>
                  </div>
                )}
                {tab === 'commitment' && (
                  <div className="chart-grid">
                    <ChartCard title="Planejado × realizado" subtitle="Plano, entrega planejada e demanda descoberta."><CommitmentChart data={trend} /></ChartCard>
                    <ChartCard title="Story Points" subtitle={`Planejado × entregue. Cobertura nas semanas com entrega: ${pointsCoverage}%.`}><StoryPointsChart data={trend} /></ChartCard>
                  </div>
                )}
                {tab === 'time' && (
                  <div className="chart-grid">
                    <ChartCard title="Lead Time P85" subtitle="Evolução semanal do tempo de entrega."><LeadTimeTrendChart data={trend} /></ChartCard>
                    <ChartCard title="Cycle Time P85" subtitle="Tempo semanal entre início e resolução."><CycleTimeTrendChart data={trend} /></ChartCard>
                  </div>
                )}
                {tab === 'analysis' && (
                  <div className="chart-grid">
                    <ChartCard title="Cycle time por etapa" subtitle="Tempo médio em cada fase do fluxo — a barra âmbar é o gargalo.">
                      <StageBreakdownChart data={analysis.stages} />
                    </ChartCard>
                    <ChartCard title="Dispersão do Lead Time" subtitle="Cada ponto é um item entregue; as linhas são P50 e P85. Vermelho = acima do P85.">
                      <LeadTimeScatterChart data={analysis.scatter} onSelectTeam={t => navigate(`/time/${encodeURIComponent(t)}`)} />
                    </ChartCard>
                    <ChartCard title="Vazão × Lead Time" subtitle="Cada ponto é uma semana. Entregar mais está piorando o tempo?">
                      <ThroughputVsLeadTimeChart data={analysis.throughputVsLead} />
                    </ChartCard>
                    <article className="chart-card wide">
                      <div className="card-heading"><div><span className="eyebrow">WIP por idade</span><h2>Aging heatmap</h2></div></div>
                      <p className="sub">Itens em andamento por time e faixa de idade — clique num time para abrir o detalhe.</p>
                      <div style={{ marginTop: 8 }}><AgingHeatmap rows={analysis.heatmap} onSelectTeam={t => navigate(`/time/${encodeURIComponent(t)}`)} /></div>
                    </article>
                    <article className="chart-card wide">
                      <div className="card-heading"><div><span className="eyebrow">Para agir agora</span><h2>Cards mais problemáticos</h2></div></div>
                      <p className="sub">Itens em andamento há mais tempo no portfólio — clique para abrir o time.</p>
                      <div style={{ marginTop: 8 }}><AttentionItemsList items={analysis.attention} onSelectTeam={t => navigate(`/time/${encodeURIComponent(t)}`)} /></div>
                    </article>
                  </div>
                )}
              </section>

              <section className="analysis-grid">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Time</th><th>Saúde</th><th>Vazão</th><th>Lead P85</th><th>WIP</th><th>Saldo</th><th>Previsibilidade</th></tr></thead>
                    <tbody>
                      {teams.map(team => {
                        const health = assessTeamHealth(team).status;
                        return (
                          <tr key={team.teamId} onClick={() => navigate(`/time/${encodeURIComponent(team.teamId)}`)}>
                            <td><strong>{teamLabel(team.teamId)}</strong></td>
                            <td><span className={`status ${healthClass[health]}`}>{healthLabel[health]}</span></td>
                            <td>{team.delivery.throughput}</td>
                            <td>{team.delivery.leadTimeP85 === null ? '—' : `${team.delivery.leadTimeP85}d`}</td>
                            <td>{team.flow.wip}</td>
                            <td>{team.flow.flowBalance > 0 ? `+${team.flow.flowBalance}` : team.flow.flowBalance}</td>
                            <td>{team.predictability.rate === null ? '—' : `${team.predictability.rate}%`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <aside className="priorities">
                  <div className="card-heading"><div><span className="eyebrow">Para agir agora</span><h2>Insights</h2></div></div>
                  {scopedInsights.slice(0, 7).map((insight, index) => (
                    <button key={insight.id} className={`priority sev-${insight.severity}`} onClick={() => navigate(`/time/${encodeURIComponent(insight.teamId)}`)}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div><small>{teamLabel(insight.teamId)}</small><strong>{insight.title}</strong><em>{insight.description}</em></div>
                      <b>→</b>
                    </button>
                  ))}
                </aside>
              </section>
            </>
          )}
      </div>
    </div>
  );
};
