import { Fragment } from 'react';
import {
  CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis, BarChart, Bar,
} from 'recharts';
import { CHART } from '../lib/chartColors';
import { teamLabel } from '../config/teamLabels';
import { AGING_BUCKETS } from '../performance/analytics';
import type {
  AgingHeatRow, AttentionItem, LeadTimeScatter, StageDuration, ThroughputLeadPoint,
} from '../performance/analytics';

const axis = { fill: CHART.axis, fontSize: 11 };
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-main)' };
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

// ── 1. Dispersão de Lead Time (control chart) ────────────────────────────────
export function LeadTimeScatterChart({ data, onSelectTeam }: { data: LeadTimeScatter; onSelectTeam?: (team: string) => void }) {
  const points = data.points.map(p => ({ ...p, x: p.resolvedAt, y: p.leadTime }));
  return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
    <XAxis type="number" dataKey="x" domain={['dataMin', 'dataMax']} tick={axis} tickFormatter={fmtDay} name="Conclusão" />
    <YAxis type="number" dataKey="y" tick={axis} tickFormatter={(v: number) => `${v}d`} name="Lead Time" />
    <ZAxis range={[36, 36]} />
    {data.p50 !== null && <ReferenceLine y={data.p50} stroke={CHART.forest} strokeDasharray="4 4" label={{ value: `P50 ${data.p50}d`, position: 'insideTopRight', fill: CHART.axis, fontSize: 10 }} />}
    {data.p85 !== null && <ReferenceLine y={data.p85} stroke={CHART.amber} strokeDasharray="4 4" label={{ value: `P85 ${data.p85}d`, position: 'insideTopRight', fill: CHART.amber, fontSize: 10 }} />}
    <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }}
      content={({ payload }) => {
        const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
        if (!p) return null;
        return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>
          <strong>{p.key}</strong> · {p.leadTime}d {p.outlier && <span style={{ color: CHART.red }}>· outlier</span>}
          <div style={{ color: 'var(--text-muted)', maxWidth: 240, marginTop: 2 }}>{p.summary.slice(0, 80)}</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{teamLabel(p.team)} · {fmtDay(p.resolvedAt)}</div>
        </div>;
      }} />
    <Scatter data={points} onClick={(p) => { const team = (p as unknown as { payload?: { team?: string } }).payload?.team; if (team) onSelectTeam?.(team); }}>
      {points.map(p => <Cell key={p.key} fill={p.outlier ? CHART.red : CHART.primary} fillOpacity={p.outlier ? 0.9 : 0.55} cursor={onSelectTeam ? 'pointer' : 'default'} />)}
    </Scatter>
  </ScatterChart></ResponsiveContainer>;
}

// ── 2. Throughput × Lead Time (correlação por semana) ────────────────────────
export function ThroughputVsLeadTimeChart({ data }: { data: readonly ThroughputLeadPoint[] }) {
  const points = data.map(p => ({ ...p, x: p.throughput, y: p.leadTimeP85 }));
  return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
    <XAxis type="number" dataKey="x" tick={axis} name="Vazão" label={{ value: 'Vazão (itens/sem)', position: 'insideBottom', offset: -8, fill: CHART.axis, fontSize: 10 }} />
    <YAxis type="number" dataKey="y" tick={axis} tickFormatter={(v: number) => `${v}d`} name="Lead Time P85" />
    <ZAxis range={[60, 60]} />
    <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }}
      content={({ payload }) => {
        const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
        if (!p) return null;
        return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>
          <strong>Semana {p.label}</strong>
          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>Vazão {p.throughput} · Lead Time P85 {p.leadTimeP85}d</div>
        </div>;
      }} />
    <Scatter data={points} fill={CHART.violet} fillOpacity={0.7} />
  </ScatterChart></ResponsiveContainer>;
}

// ── 3. Cycle time por etapa (barras horizontais, gargalo destacado) ──────────
export function StageBreakdownChart({ data }: { data: readonly StageDuration[] }) {
  const maxAvg = Math.max(...data.map(d => d.avg), 0);
  const bottleneck = data.reduce((max, d) => (d.avg > max.avg ? d : max), data[0] ?? { avg: 0, stage: '' });
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={[...data]} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
    <XAxis type="number" tick={axis} tickFormatter={(v: number) => `${v}d`} />
    <YAxis type="category" dataKey="stage" tick={{ ...axis, fontSize: 12 }} width={128} />
    <Tooltip contentStyle={tooltipStyle}
      content={({ payload }) => {
        const row = payload?.[0]?.payload as StageDuration | undefined;
        if (!row) return null;
        return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>
          <strong>{row.stage}</strong>
          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{row.avg}d em média · P85 {row.p85}d · {row.share}% do ciclo</div>
        </div>;
      }} />
    <Bar dataKey="avg" radius={[0, 6, 6, 0]} maxBarSize={30} label={{ position: 'right', formatter: (v: unknown) => `${v}d`, fill: CHART.axis, fontSize: 11 }}>
      {data.map(d => <Cell key={d.stage} fill={d.stage === bottleneck.stage && maxAvg > 0 ? CHART.amber : CHART.forest} />)}
    </Bar>
  </BarChart></ResponsiveContainer>;
}

// ── 4. Aging heatmap (times × faixas de idade do WIP) ────────────────────────
// Cor por faixa (severidade) com opacidade proporcional à contagem relativa da linha.
const BUCKET_COLOR = [CHART.sage, CHART.mint, CHART.amber, CHART.red];

export function AgingHeatmap({ rows, onSelectTeam }: { rows: readonly AgingHeatRow[]; onSelectTeam?: (team: string) => void }) {
  const maxCell = Math.max(1, ...rows.flatMap(r => r.buckets));
  return <div style={{ overflowX: 'auto' }}>
    <div style={{ display: 'grid', gridTemplateColumns: `minmax(120px, 1.4fr) repeat(${AGING_BUCKETS.length}, 1fr) 0.7fr`, gap: 4, minWidth: 420, fontSize: 12 }}>
      <div />
      {AGING_BUCKETS.map(b => <div key={b} style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{b}</div>)}
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>Total</div>
      {rows.map(row => <Fragment key={row.team}>
        <button onClick={() => onSelectTeam?.(row.team)} title={teamLabel(row.team)}
          style={{ textAlign: 'left', background: 'none', border: 0, color: 'var(--text-main)', cursor: onSelectTeam ? 'pointer' : 'default', padding: '6px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
          {teamLabel(row.team)}
        </button>
        {row.buckets.map((count, i) => (
          <div key={`${row.team}-${i}`} style={{
            display: 'grid', placeItems: 'center', height: 34, borderRadius: 8, fontWeight: 700,
            color: count ? '#0b140e' : 'var(--text-muted)',
            background: count ? `color-mix(in srgb, ${BUCKET_COLOR[i]} ${30 + Math.round((count / maxCell) * 65)}%, transparent)` : 'var(--surface-2, rgba(130,146,138,0.08))',
          }}>{count || '·'}</div>
        ))}
        <div style={{ display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--text-main)' }}>{row.total}</div>
      </Fragment>)}
    </div>
  </div>;
}

// ── 5. Cards mais problemáticos (drill-down acionável) ───────────────────────
export function AttentionItemsList({ items, onSelectTeam }: { items: readonly AttentionItem[]; onSelectTeam?: (team: string) => void }) {
  if (items.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum item em andamento acima de 15 dias. 🎉</p>;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {items.map(item => (
      <button key={item.key} onClick={() => onSelectTeam?.(item.team)}
        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', padding: '0.6rem 0.7rem', border: '1px solid var(--border-default)', borderRadius: 10, background: 'var(--surface)', cursor: onSelectTeam ? 'pointer' : 'default' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, padding: '3px 8px', borderRadius: 99, color: item.severity === 'critical' ? CHART.red : CHART.amber, background: `color-mix(in srgb, ${item.severity === 'critical' ? CHART.red : CHART.amber} 14%, transparent)` }}>
          {item.days}d
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 13, color: 'var(--text-main)' }}>{item.key}</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.summary || item.reason}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{teamLabel(item.team)}<br /><span style={{ opacity: 0.8 }}>{item.status}</span></span>
      </button>
    ))}
  </div>;
}
