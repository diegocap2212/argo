import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamLabel } from '../config/teamLabels';
import {
  COMPARISON_METRICS,
  rankByMetric,
  type ComparisonMetric,
  type SMComparison,
  type SMComparisonEntry,
  type TeamComparisonEntry,
} from '../performance/smComparison';
import type { TeamHealthStatus } from '../performance/health';

const healthLabel: Record<TeamHealthStatus, string> = { healthy: 'Saudável', attention: 'Atenção', critical: 'Crítico' };
const healthClass: Record<TeamHealthStatus, string> = { healthy: 'saudavel', attention: 'atencao', critical: 'critico' };

function fmt(value: number | null, unit: string): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('pt-BR')}${unit}`;
}

/** Cartões-resumo de cada agilista, clicáveis para o portfólio dele. */
function AgilistaCards({ sms }: { sms: SMComparisonEntry[] }) {
  const navigate = useNavigate();
  return (
    <div className="sm-cards">
      {sms.map(sm => (
        <button key={sm.id} className="sm-card" onClick={() => navigate(`/sm/${sm.id}`)}>
          <div className="sm-card-head">
            <span className="sm-avatar" style={{ background: sm.color }}>{sm.avatar}</span>
            <div>
              <strong>{sm.name}</strong>
              <small>{sm.teamCount} {sm.teamCount === 1 ? 'time' : 'times'}</small>
            </div>
            <span className={`pill ${healthClass[sm.health]}`}>{healthLabel[sm.health]}</span>
          </div>
          <div className="sm-card-metrics">
            <div><b>{sm.snapshot.delivery.throughput}</b><span>Vazão</span></div>
            <div><b>{fmt(sm.snapshot.delivery.leadTimeP85, 'd')}</b><span>Lead P85</span></div>
            <div><b>{sm.snapshot.flow.wip}</b><span>WIP</span></div>
            <div><b>{fmt(sm.snapshot.predictability.rate, '%')}</b><span>Previsib.</span></div>
          </div>
        </button>
      ))}
    </div>
  );
}

interface RankRow { id: string; label: string; sublabel?: string; color: string; value: number | null; onClick?: () => void; }

function Ranking({ rows, metric }: { rows: RankRow[]; metric: ComparisonMetric }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value ?? 0)));
  return (
    <div className="rank-list">
      {rows.map((row, index) => (
        <div key={row.id} className={`rank-row${row.onClick ? ' clickable' : ''}`} onClick={row.onClick} role={row.onClick ? 'button' : undefined}>
          <span className="rank-pos">{String(index + 1).padStart(2, '0')}</span>
          <div className="rank-body">
            <div className="rank-line">
              <span className="rank-name">
                {row.label}
                {row.sublabel && <em className="rank-sub" style={{ color: row.color }}>{row.sublabel}</em>}
              </span>
              <b className="rank-value">{fmt(row.value, metric.unit)}</b>
            </div>
            <div className="rank-track">
              <span className="rank-fill" style={{ width: `${(Math.abs(row.value ?? 0) / max) * 100}%`, background: row.color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TowerComparison({ comparison }: { comparison: SMComparison }) {
  const navigate = useNavigate();
  const [metricKey, setMetricKey] = useState('throughput');
  const [mode, setMode] = useState<'sms' | 'teams'>('sms');
  const metric = COMPARISON_METRICS.find(m => m.key === metricKey) ?? COMPARISON_METRICS[0];

  const rows = useMemo<RankRow[]>(() => {
    if (mode === 'sms') {
      return rankByMetric(comparison.sms, metric).map((sm: SMComparisonEntry) => ({
        id: sm.id, label: sm.name, color: sm.color, value: metric.get(sm.snapshot),
        onClick: () => navigate(`/sm/${sm.id}`),
      }));
    }
    const owned = comparison.teams.filter(team => team.smId !== null);
    return rankByMetric(owned, metric).map((team: TeamComparisonEntry) => ({
      id: team.teamId, label: teamLabel(team.teamId), sublabel: team.smName, color: team.color,
      value: metric.get(team.snapshot), onClick: () => navigate(`/time/${encodeURIComponent(team.teamId)}`),
    }));
  }, [comparison, metric, mode, navigate]);

  if (comparison.sms.length === 0) return null;

  return (
    <section className="tower-comparison">
      <div className="section-title">
        <div>
          <span className="eyebrow">Comparativo · Agilistas</span>
          <h2>Como os portfólios se comparam</h2>
          <p>Some e ranqueie os times por agilista. Clique para abrir o portfólio ou o time.</p>
        </div>
      </div>

      <AgilistaCards sms={comparison.sms} />

      <article className="chart-card wide rank-card">
        <div className="rank-controls">
          <div className="segmented">
            <button className={mode === 'sms' ? 'selected' : ''} onClick={() => setMode('sms')}>Agilistas</button>
            <button className={mode === 'teams' ? 'selected' : ''} onClick={() => setMode('teams')}>Times</button>
          </div>
          <div className="rank-metric">
            {metric.direction === 'lower' && <span className="rank-hint">menor é melhor</span>}
            <select className="rd-select" value={metricKey} onChange={e => setMetricKey(e.target.value)} aria-label="Métrica do comparativo">
              {COMPARISON_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <Ranking rows={rows} metric={metric} />
      </article>
    </section>
  );
}
