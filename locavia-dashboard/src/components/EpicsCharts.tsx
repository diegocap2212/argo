import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART } from '../lib/chartColors';
import { teamLabel } from '../config/teamLabels';
import type { EpicSummary, EpicsView } from '../performance/epics';

const axis = { fill: CHART.axis, fontSize: 11 };
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-main)' };
const trunc = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ── 1. Progresso por épico (barras horizontais: concluído vs restante) ───────
export function EpicProgressChart({ epics }: { epics: readonly EpicSummary[] }) {
  const data = epics.slice(0, 12).map(e => ({
    label: `${trunc(e.name, 30)}  ${e.progress}%`,
    done: e.done,
    rest: Math.max(e.total - e.done, 0),
    key: e.key,
  }));
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
    <XAxis type="number" tick={axis} allowDecimals={false} />
    <YAxis type="category" dataKey="label" tick={{ ...axis, fontSize: 11 }} width={230} />
    <Tooltip contentStyle={tooltipStyle}
      content={({ payload }) => {
        const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
        if (!p) return null;
        return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>
          <strong>{p.key}</strong>
          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{p.done} concluídos · {p.rest} restantes</div>
        </div>;
      }} />
    <Bar dataKey="done" name="Concluídos" stackId="e" fill={CHART.primary} radius={[4, 0, 0, 4]} maxBarSize={22} />
    <Bar dataKey="rest" name="Restantes" stackId="e" fill={CHART.neutral} fillOpacity={0.35} radius={[0, 4, 4, 0]} maxBarSize={22} />
  </BarChart></ResponsiveContainer>;
}

// ── 2. Distribuição: trabalho com épico × avulso (donut) ─────────────────────
export function EpicCoverageChart({ view }: { view: EpicsView }) {
  const data = [
    { name: 'Com épico', value: view.withEpic, fill: CHART.primary },
    { name: 'Avulso', value: view.withoutEpic, fill: CHART.neutral },
  ];
  return <div style={{ position: 'relative', height: '100%' }}>
    <ResponsiveContainer width="100%" height="100%"><PieChart>
      <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} strokeWidth={0}>
        {data.map(d => <Cell key={d.name} fill={d.fill} fillOpacity={d.name === 'Avulso' ? 0.4 : 1} />)}
      </Pie>
      <Tooltip contentStyle={tooltipStyle}
        content={({ payload }) => {
          const p = payload?.[0];
          if (!p) return null;
          return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>{p.name}: <strong>{p.value as number}</strong> itens</div>;
        }} />
    </PieChart></ResponsiveContainer>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ textAlign: 'center' }}>
        <strong style={{ fontSize: 26, color: 'var(--text-main)' }}>{view.coverage}%</strong>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>sob um épico</div>
      </div>
    </div>
  </div>;
}

// ── 3. Tabela de épicos (status, progresso, volume, idade) ───────────────────
export function EpicsTable({ epics }: { epics: readonly EpicSummary[] }) {
  if (epics.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum épico com itens no período.</p>;
  return <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
          <th style={{ padding: '6px 8px' }}>Épico</th>
          <th style={{ padding: '6px 8px' }}>Status</th>
          <th style={{ padding: '6px 8px' }}>Progresso</th>
          <th style={{ padding: '6px 8px' }}>Itens</th>
          <th style={{ padding: '6px 8px' }}>Pontos</th>
          <th style={{ padding: '6px 8px' }}>Idade</th>
          <th style={{ padding: '6px 8px' }}>Times</th>
        </tr>
      </thead>
      <tbody>
        {epics.slice(0, 20).map(e => (
          <tr key={e.key} style={{ borderTop: '1px solid var(--border-default)' }}>
            <td style={{ padding: '7px 8px' }}>
              <strong style={{ color: 'var(--text-main)' }}>{e.key}</strong>
              <span style={{ display: 'block', color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
            </td>
            <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{e.status}</td>
            <td style={{ padding: '7px 8px', minWidth: 120 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'color-mix(in srgb, var(--text-muted) 18%, transparent)', overflow: 'hidden' }}>
                  <div style={{ width: `${e.progress}%`, height: '100%', background: e.progress === 100 ? CHART.success : CHART.primary }} />
                </div>
                <span style={{ color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{e.progress}%</span>
              </div>
            </td>
            <td style={{ padding: '7px 8px', color: 'var(--text-main)' }}>{e.done}/{e.total}</td>
            <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{e.points || '—'}</td>
            <td style={{ padding: '7px 8px', color: e.ageDays > 120 ? CHART.red : 'var(--text-muted)' }}>{e.ageDays}d</td>
            <td style={{ padding: '7px 8px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.teams.map(teamLabel).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>;
}
