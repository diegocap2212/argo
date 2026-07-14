import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subDays } from 'date-fns';
import { teamLabel } from '../config/teamLabels';
import { usePerformancePortfolio } from '../hooks/usePerformancePortfolio';
import { assessTeamHealth, type TeamHealthStatus } from '../performance/health';
import { computeSMComparison } from '../performance/smComparison';
import { SM_CONFIGS } from '../config/sm-config';
import { FlowVolumeChart } from '../components/PerformanceCharts';
import { TowerComparison } from '../components/TowerComparison';
import '../styles/redesign.css';

const healthLabel: Record<TeamHealthStatus, string> = { healthy: 'Saudável', attention: 'Atenção', critical: 'Crítico' };
const healthClass: Record<TeamHealthStatus, string> = { healthy: 'saudavel', attention: 'atencao', critical: 'critico' };
const healthOrder: Record<TeamHealthStatus, number> = { critical: 0, attention: 1, healthy: 2 };
const FILTERS: Array<{ key: 'Todos' | TeamHealthStatus; label: string }> = [
  { key: 'Todos', label: 'Todos' },
  { key: 'critical', label: 'Crítico' },
  { key: 'attention', label: 'Atenção' },
  { key: 'healthy', label: 'Saudável' },
];

const fmt = (value: number) => value.toLocaleString('pt-BR');
const shortDate = (date: Date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

export default function PerformanceDashboard() {
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(8);
  const [filter, setFilter] = useState<'Todos' | TeamHealthStatus>('Todos');
  const [search, setSearch] = useState('');
  const { items, period, portfolio, previousPortfolio, insights, trend, loading, error, now } = usePerformancePortfolio(weeks * 7);

  const comparison = useMemo(
    () => computeSMComparison(items, portfolio.teams, SM_CONFIGS, period, now),
    [items, portfolio.teams, period, now],
  );

  const rows = useMemo(() => portfolio.teams
    .map(team => ({ team, health: assessTeamHealth(team).status }))
    .sort((a, b) => healthOrder[a.health] - healthOrder[b.health] || b.team.flow.flowBalance - a.team.flow.flowBalance),
    [portfolio.teams]);

  const teamsInAttention = rows.filter(row => row.health !== 'healthy').length;
  const totals = portfolio.totals;
  const throughputDelta = previousPortfolio.totals.throughput > 0
    ? Math.round(((totals.throughput - previousPortfolio.totals.throughput) / previousPortfolio.totals.throughput) * 100)
    : null;
  const agingShare = totals.wip > 0 ? Math.round((totals.agingItems / totals.wip) * 100) : 0;
  const attentionShare = totals.teams > 0 ? Math.round((teamsInAttention / totals.teams) * 100) : 0;

  // Time-foco: maior pressão de fluxo entre os não saudáveis.
  const focus = rows.find(row => row.health !== 'healthy' && row.team.flow.flowBalance > 0)?.team ?? rows[0]?.team;

  // Top 3 prioridades por time distinto (insights já vêm ordenados por severidade).
  const priorities = useMemo(() => {
    const seen = new Set<string>();
    const picked: typeof insights = [];
    for (const insight of insights) {
      if (seen.has(insight.teamId)) continue;
      seen.add(insight.teamId);
      picked.push(insight);
      if (picked.length === 3) break;
    }
    return picked;
  }, [insights]);

  const visible = rows.filter(row =>
    (filter === 'Todos' || row.health === filter) &&
    teamLabel(row.team.teamId).toLowerCase().includes(search.toLowerCase()));

  const rangeLabel = `${shortDate(subDays(now, weeks * 7))} — ${shortDate(now)} ${now.getFullYear()}`;

  return (
    <div className="rd">
      <div className="rd-main">
        {loading ? (
          <div className="rd-state">Carregando performance dos times…</div>
        ) : error ? (
          <div className="rd-state" style={{ color: 'var(--red)' }}>{error}</div>
        ) : (
          <>
            <section className="hero">
              <div className="intro">
                <span className="eyebrow">Performance · Times</span>
                <h1>Saúde da<br /><em>operação.</em></h1>
                <p>Fluxo, entrega e previsibilidade traduzidos em sinais claros para orientar a próxima conversa.</p>
              </div>
              {focus && (
                <article className="focus-card">
                  <div className="focus-head">
                    <span>Principal ponto de atenção</span>
                    <span className={`pill ${assessTeamHealth(focus).status}`}>{healthLabel[assessTeamHealth(focus).status]}</span>
                  </div>
                  <h2>O fluxo está crescendo<br />mais rápido que a entrega.</h2>
                  <p>{teamsInAttention} dos {totals.teams} times apresentam ao menos um risco. Comece por {teamLabel(focus.teamId)}, onde o saldo chegou a {focus.flow.flowBalance > 0 ? '+' : ''}{focus.flow.flowBalance} itens.</p>
                  <div className="focus-bottom">
                    <div>
                      <strong>{totals.flowBalance > 0 ? '+' : ''}{fmt(totals.flowBalance)}</strong>
                      <small>saldo da torre</small>
                    </div>
                    <button onClick={() => navigate(`/time/${encodeURIComponent(focus.teamId)}`)}>Ver time <span>→</span></button>
                  </div>
                </article>
              )}
            </section>

            <section className="filterbar">
              <div className="fb-label"><span className="eyebrow">Período de análise</span><strong>Últimas {weeks} semanas</strong></div>
              <input type="range" min={1} max={24} value={weeks} onChange={event => setWeeks(Number(event.target.value))} aria-label="Período em semanas" />
              <span className="date">{rangeLabel}</span>
            </section>

            <section className="snapshot">
              <div className="section-title">
                <div><span className="eyebrow">Leitura rápida</span><h2>Panorama da torre</h2></div>
                <span>{totals.teams} times com dados no período</span>
              </div>
              <div className="metric-grid">
                <article className="metric primary">
                  <small>Entregas</small><strong>{fmt(totals.throughput)}</strong>
                  {throughputDelta !== null && <span className="trend">{throughputDelta >= 0 ? '↗' : '↘'} {Math.abs(throughputDelta)}%</span>}
                  <p>itens concluídos</p>
                </article>
                <article className="metric">
                  <small>WIP atual</small><strong>{fmt(totals.wip)}</strong>
                  <p>itens em andamento</p>
                </article>
                <article className="metric warning">
                  <small>Itens envelhecidos</small><strong>{fmt(totals.agingItems)}</strong>
                  <span className="trend warn">{agingShare}% do WIP</span>
                  <p>há mais de 15 dias</p>
                </article>
                <article className="metric">
                  <small>Times em atenção</small><strong>{fmt(teamsInAttention)}</strong>
                  <span className="trend warn">{attentionShare}%</span>
                  <p>com ao menos um risco</p>
                </article>
              </div>
            </section>

            <TowerComparison comparison={comparison} />

            <section className="analysis-grid">
              <article className="chart-card">
                <div className="card-heading">
                  <div><span className="eyebrow">Evolução do sistema</span><h2>Entradas × saídas</h2></div>
                </div>
                <p>Balanço semanal do sistema. Violeta é demanda; verde é entrega.</p>
                <div className="chart-host"><FlowVolumeChart data={trend} /></div>
              </article>
              <aside className="priorities">
                <div className="card-heading">
                  <div><span className="eyebrow">Para agir agora</span><h2>Prioridades</h2></div>
                </div>
                {priorities.map((insight, index) => (
                  <button className={`priority sev-${insight.severity}`} key={insight.id} onClick={() => navigate(`/time/${encodeURIComponent(insight.teamId)}`)}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <small>{teamLabel(insight.teamId)}</small>
                      <strong>{insight.title}</strong>
                      <em>{insight.description}</em>
                    </div>
                    <b>→</b>
                  </button>
                ))}
              </aside>
            </section>

            <section className="health-section">
              <div className="section-title">
                <div><span className="eyebrow">Visão comparativa</span><h2>Saúde dos times</h2><p>Encontre rapidamente onde a conversa precisa acontecer.</p></div>
              </div>
              <div className="table-tools">
                <div className="segmented">
                  {FILTERS.map(option => (
                    <button key={option.key} onClick={() => setFilter(option.key)} className={filter === option.key ? 'selected' : ''}>{option.label}</button>
                  ))}
                </div>
                <label><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar time" /></label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th><th>Saúde</th><th>Vazão</th><th>Lead Time P85</th><th>WIP</th><th>Saldo</th><th>Previsibilidade</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ team, health }) => (
                      <tr key={team.teamId} onClick={() => navigate(`/time/${encodeURIComponent(team.teamId)}`)}>
                        <td><strong>{teamLabel(team.teamId)}</strong></td>
                        <td><span className={`status ${healthClass[health]}`}>{healthLabel[health]}</span></td>
                        <td>{team.delivery.throughput}</td>
                        <td>{team.delivery.leadTimeP85 === null ? '—' : `${team.delivery.leadTimeP85}d`}</td>
                        <td>{team.flow.wip}</td>
                        <td>{team.flow.flowBalance > 0 ? `+${team.flow.flowBalance}` : team.flow.flowBalance}</td>
                        <td>
                          <div className="predict">
                            <span style={{ width: `${team.predictability.rate ?? 0}%` }} />
                            <em>{team.predictability.rate === null ? '—' : `${team.predictability.rate}%`}</em>
                          </div>
                        </td>
                        <td><span className="arrow" aria-label={`Abrir ${teamLabel(team.teamId)}`}>→</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
