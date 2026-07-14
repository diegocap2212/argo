import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { type DashboardTab } from '../components/DashboardTabs';
import { AgingDistributionChart, CommitmentChart, CumulativeFlowChart, CycleTimeTrendChart, FlowVolumeChart, StoryPointsChart, ThroughputByTypeChart, WeeklyIntakeChart } from '../components/PerformanceCharts';
import { AgingHeatmap, AttentionItemsList, LeadTimeScatterChart, StageBreakdownChart, ThroughputVsLeadTimeChart } from '../components/AnalysisCharts';
import { EpicCoverageChart, EpicProgressChart, EpicsTable } from '../components/EpicsCharts';
import { teamLabel } from '../config/teamLabels';
import { useTeamPerformance } from '../hooks/useTeamPerformance';
import '../styles/redesign.css';

const PERIODS = [4, 8, 12, 16, 24];

function ChartCard({ title, subtitle, tall, children }: { title: string; subtitle?: string; tall?: boolean; children: React.ReactNode }) {
  return (
    <article className="chart-card">
      <div className="card-heading"><div><h2>{title}</h2></div></div>
      {subtitle && <p className="sub">{subtitle}</p>}
      <div className={`chart-host${tall ? ' tall' : ''}`}>{children}</div>
    </article>
  );
}

export default function TeamDetail() {
  const { teamId = '' } = useParams<{ teamId: string }>();
  const teamName = decodeURIComponent(teamId);
  const navigate = useNavigate();
  const location = useLocation();
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  const [weeks, setWeeks] = useState(8);
  const [tab, setTab] = useState<DashboardTab>('delivery');
  const { items, snapshot, previousSnapshot, insights, trend, cfd, aging, analysis, epics, loading, error } = useTeamPerformance(teamName, weeks * 7);
  const goToTeam = (team: string) => navigate(`/time/${encodeURIComponent(team)}`);
  const throughputDelta = previousSnapshot.delivery.throughput
    ? Math.round(((snapshot.delivery.throughput - previousSnapshot.delivery.throughput) / previousSnapshot.delivery.throughput) * 100)
    : null;
  const pointsCoverage = Math.round(trend.filter(p => p.throughput > 0).reduce((s, p) => s + p.pointsCoverage, 0) / Math.max(trend.filter(p => p.throughput > 0).length, 1));

  return (
    <div className="rd">
      <div className="rd-main" style={embedded ? { padding: '24px 24px 60px' } : undefined}>
        {!embedded && (
          <section className="page-head">
            <div className="ph-title">
              <button className="back-btn" onClick={() => navigate('/')} aria-label="Voltar"><ArrowLeft size={16} /></button>
              <div>
                <span className="eyebrow">Performance · Time</span>
                <h1>{teamLabel(teamName)}</h1>
                <p>Fluxo, entrega, previsibilidade e qualidade dos dados.</p>
              </div>
            </div>
            <div className="head-actions">
              <select className="rd-select" value={weeks} onChange={e => setWeeks(Number(e.target.value))} aria-label="Período em semanas">
                {PERIODS.map(w => <option key={w} value={w}>Últimas {w} semanas</option>)}
              </select>
            </div>
          </section>
        )}

        {loading ? <div className="rd-state">Carregando performance…</div>
          : error ? <div className="rd-state" style={{ color: 'var(--red)' }}>{error}</div>
          : items.length === 0 ? <div className="rd-state">Nenhum dado encontrado para este time.</div>
          : (
            <>
              <section className="snapshot" style={{ marginTop: embedded ? 0 : 36 }}>
                <div className="metric-grid six">
                  <article className="metric primary">
                    <small>Vazão</small><strong>{snapshot.delivery.throughput}</strong>
                    {throughputDelta !== null && <span className="trend">{throughputDelta >= 0 ? '↗' : '↘'} {Math.abs(throughputDelta)}%</span>}
                    <p>entregas no período</p>
                  </article>
                  <article className="metric"><small>Lead Time P85</small><strong>{snapshot.delivery.leadTimeP85 === null ? '—' : `${snapshot.delivery.leadTimeP85}d`}</strong><p>criação → resolução</p></article>
                  <article className="metric"><small>Cycle Time P85</small><strong>{snapshot.delivery.cycleTimeP85 === null ? '—' : `${snapshot.delivery.cycleTimeP85}d`}</strong><p>início → resolução</p></article>
                  <article className="metric warning"><small>WIP</small><strong>{snapshot.flow.wip}</strong><p>{snapshot.flow.agingItems} envelhecidos</p></article>
                  <article className="metric"><small>Previsibilidade</small><strong>{snapshot.predictability.rate === null ? '—' : `${snapshot.predictability.rate}%`}</strong><p>{snapshot.predictability.delivered}/{snapshot.predictability.committed} compromissos</p></article>
                  <article className="metric"><small>Saldo de fluxo</small><strong>{snapshot.flow.flowBalance > 0 ? '+' : ''}{snapshot.flow.flowBalance}</strong><p>entradas − saídas</p></article>
                </div>
              </section>

              <section>
                <div className="tabs">
                  {(['delivery', 'speed', 'health', 'epics'] as DashboardTab[]).map(id => (
                    <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                      {id === 'delivery' ? 'Entrega' : id === 'speed' ? 'Tempo & Gargalos' : id === 'health' ? 'Saúde & Prioridades' : 'Épicos'}
                    </button>
                  ))}
                </div>

                {tab === 'delivery' && (
                  <div className="chart-grid">
                    <ChartCard title="O que entrou e o que saiu" subtitle="Itens novos na semana comparados às entregas."><WeeklyIntakeChart data={trend} /></ChartCard>
                    <ChartCard title="Entradas × saídas" subtitle="Balanço semanal do fluxo do time."><FlowVolumeChart data={trend} /></ChartCard>
                    <ChartCard title="CFD do time" subtitle="A fazer, em andamento e concluído ao longo do período." tall><CumulativeFlowChart data={cfd} /></ChartCard>
                    <ChartCard title="Vazão por tipo" subtitle="Composição semanal das entregas por tipo."><ThroughputByTypeChart data={trend} /></ChartCard>
                  </div>
                )}

                {tab === 'speed' && (
                  <div className="chart-grid">
                    <ChartCard title="Cycle time por etapa" subtitle="Tempo médio em cada fase do fluxo — a barra âmbar é o gargalo.">
                      <StageBreakdownChart data={analysis.stages} />
                    </ChartCard>
                    <ChartCard title="Dispersão do Lead Time" subtitle="Cada ponto é um item entregue; as linhas são P50 e P85. Vermelho = acima do P85.">
                      <LeadTimeScatterChart data={analysis.scatter} />
                    </ChartCard>
                    <ChartCard title="Vazão × Lead Time" subtitle="Barras = entregas na semana; linha = Lead Time P85. As duas sobem juntas (trade-off)?">
                      <ThroughputVsLeadTimeChart data={analysis.throughputVsLead} />
                    </ChartCard>
                    <ChartCard title="Evolução do Cycle Time P85" subtitle="Tempo semanal entre início e resolução."><CycleTimeTrendChart data={trend} /></ChartCard>
                  </div>
                )}

                {tab === 'health' && (
                  <div className="chart-grid">
                    <article className="chart-card wide">
                      <div className="card-heading"><div><span className="eyebrow">Para agir agora</span><h2>Cards mais problemáticos</h2></div></div>
                      <p className="sub">Itens em andamento há mais tempo — clique para abrir o time.</p>
                      <div style={{ marginTop: 8 }}><AttentionItemsList items={analysis.attention} onSelectTeam={goToTeam} /></div>
                    </article>
                    <article className="chart-card">
                      <div className="card-heading"><div><span className="eyebrow">WIP por idade</span><h2>Aging heatmap</h2></div></div>
                      <p className="sub">Itens em andamento por faixa de idade — quanto mais quente, mais trabalho envelhecendo.</p>
                      <div style={{ marginTop: 8 }}><AgingHeatmap rows={analysis.heatmap} onSelectTeam={goToTeam} /></div>
                    </article>
                    <ChartCard title="Aging do WIP" subtitle="Distribuição atual dos itens em andamento por idade."><AgingDistributionChart data={aging} /></ChartCard>
                    <ChartCard title="Planejado × realizado" subtitle="Plano, entrega planejada e demanda descoberta."><CommitmentChart data={trend} /></ChartCard>
                    <ChartCard title="Story Points" subtitle={`Planejado × entregue. Cobertura nas semanas com entrega: ${pointsCoverage}%.`}><StoryPointsChart data={trend} /></ChartCard>
                    <article className="chart-card wide">
                      <div className="card-heading"><div><span className="eyebrow">Leitura do período</span><h2>Insights</h2></div></div>
                      <div style={{ marginTop: 8 }}>
                        {insights.map((insight, index) => (
                          <div className={`priority sev-${insight.severity}`} key={insight.id} style={{ cursor: 'default' }}>
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <div><strong>{insight.title}</strong><em>{insight.description}</em></div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                )}

                {tab === 'epics' && (
                  <div className="chart-grid">
                    <ChartCard title="Progresso por épico" subtitle="Concluídos (verde) × restantes por épico ativo. Top 12 por volume." tall>
                      <EpicProgressChart epics={epics.epics} />
                    </ChartCard>
                    <ChartCard title="Trabalho sob épico" subtitle="Quanto do que o time toca está ligado a um épico (planejado) vs avulso.">
                      <EpicCoverageChart view={epics} />
                    </ChartCard>
                    <article className="chart-card wide">
                      <div className="card-heading"><div><span className="eyebrow">Iniciativas</span><h2>Épicos do time</h2></div></div>
                      <p className="sub">Status, progresso, volume e idade. Idade em vermelho passa de 120 dias.</p>
                      <div style={{ marginTop: 8 }}><EpicsTable epics={epics.epics} /></div>
                    </article>
                  </div>
                )}
              </section>
            </>
          )}
      </div>
    </div>
  );
}
