import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART } from '../lib/chartColors';
import type { AgingBucket, CumulativeFlowPoint, PerformanceTrendPoint } from '../performance/trends';
import type { TeamPerformanceSnapshot } from '../performance/types';
import { teamLabel } from '../config/teamLabels';

export function DashboardChartCard({ title, subtitle, children, height = 340 }: { title: string; subtitle: string; children: ReactNode; height?: number }) {
  return <div className="premium-card" style={{ padding: '1.25rem', minHeight: height }}>
    <h2 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>{title}</h2>
    <p style={{ margin: '0.3rem 0 1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{subtitle}</p>
    <div style={{ height: height - 90 }}>{children}</div>
  </div>;
}

const axis = { fill: CHART.axis, fontSize: 11 };
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-main)' };
// Operacional só tem US(História)/Task(Tarefa)/Bug/Spike — ver performance/operational.ts.
const itemTypes = ['História', 'Bug', 'Tarefa', 'Spike'] as const;
const typeColors = [CHART.primary, CHART.red, CHART.mint, CHART.sage];

export function WeeklyIntakeChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    <Bar dataKey="newItems" name="Novos na semana" fill={CHART.violet} radius={[4, 4, 0, 0]} />
    <Line dataKey="throughput" name="Entregues" stroke={CHART.primary} strokeWidth={2.5} />
  </ComposedChart></ResponsiveContainer>;
}

export function CommitmentChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    <Bar dataKey="plannedAtStart" name="Planejado no início" fill={CHART.primary} radius={[4, 4, 0, 0]} />
    <Bar dataKey="deliveredPlanned" name="Planejado entregue" fill={CHART.mint} radius={[4, 4, 0, 0]} />
    <Bar dataKey="unplannedIntake" name="Comprometido depois" fill={CHART.amber} radius={[4, 4, 0, 0]} />
    <Bar dataKey="unknownCommitment" name="Sem compromisso" fill={CHART.neutral} radius={[4, 4, 0, 0]} />
  </BarChart></ResponsiveContainer>;
}

export function StoryPointsChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  const deliveryWeeks = data.filter(point => point.throughput > 0);
  const coverage = Math.round(deliveryWeeks.reduce((sum, point) => sum + point.pointsCoverage, 0) / Math.max(deliveryWeeks.length, 1));
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
    {coverage < 40 && <div role="note" style={{ padding: '0.45rem 0.65rem', borderRadius: 8, background: 'color-mix(in srgb, var(--warn) 12%, transparent)', color: 'var(--warn)', fontSize: '0.7rem', fontWeight: 700 }}>Baixa confiança: apenas {coverage}% das entregas têm Story Points.</div>}
    <div style={{ flex: 1, minHeight: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    <Bar dataKey="pointsCommitted" name="Pontos planejados" fill={CHART.violet} radius={[4, 4, 0, 0]} />
    <Bar dataKey="pointsDelivered" name="Pontos entregues" fill={CHART.primary} radius={[4, 4, 0, 0]} />
    </BarChart></ResponsiveContainer></div>
  </div>;
}

export function ThroughputByTypeChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  const chartData = data.map(point => ({ ...point, ...point.byType }));
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    {itemTypes.map((type, index) => <Bar key={type} dataKey={type} name={type} stackId="types" fill={typeColors[index]} />)}
  </BarChart></ResponsiveContainer>;
}

export function FlowVolumeChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    <Bar dataKey="inflow" name="Entradas" fill={CHART.violet} radius={[4, 4, 0, 0]} />
    <Bar dataKey="throughput" name="Saídas" fill={CHART.primary} radius={[4, 4, 0, 0]} />
  </BarChart></ResponsiveContainer>;
}

export function LeadTimeTrendChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
    <defs><linearGradient id="leadP85Gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.amber} stopOpacity={0.32} /><stop offset="100%" stopColor={CHART.amber} stopOpacity={0.02} /></linearGradient></defs>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis tick={axis} tickFormatter={(value: number) => `${value}d`} />
    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value ?? '—'}d`, 'Lead Time P85']} />
    <Area type="monotone" dataKey="leadTimeP85" name="Lead Time P85" stroke={CHART.amber} strokeWidth={2.5} fill="url(#leadP85Gradient)" connectNulls />
  </AreaChart></ResponsiveContainer>;
}

export function CycleTimeTrendChart({ data }: { data: readonly PerformanceTrendPoint[] }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
    <defs><linearGradient id="cycleP85Gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.violet} stopOpacity={0.32} /><stop offset="100%" stopColor={CHART.violet} stopOpacity={0.02} /></linearGradient></defs>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis tick={axis} tickFormatter={(value: number) => `${value}d`} />
    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value ?? '—'}d`, 'Cycle Time P85']} />
    <Area type="monotone" dataKey="cycleTimeP85" name="Cycle Time P85" stroke={CHART.violet} strokeWidth={2.5} fill="url(#cycleP85Gradient)" connectNulls />
  </AreaChart></ResponsiveContainer>;
}

export function AgingDistributionChart({ data }: { data: readonly AgingBucket[] }) {
  const chartData = data.map(bucket => ({ ...bucket, fill: bucket.severity === 'critical' ? CHART.red : bucket.severity === 'attention' ? CHART.amber : CHART.sage }));
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Itens em andamento']} />
    <Bar dataKey="count" name="Itens" radius={[5, 5, 0, 0]}>{chartData.map(bucket => <Cell key={bucket.label} fill={bucket.fill} />)}</Bar>
  </BarChart></ResponsiveContainer>;
}

export function CumulativeFlowChart({ data }: { data: readonly CumulativeFlowPoint[] }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="label" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    <Area type="monotone" dataKey="done" name="Concluído" stackId="flow" stroke={CHART.success} fill={CHART.success} fillOpacity={0.8} />
    <Area type="monotone" dataKey="inProgress" name="Em andamento" stackId="flow" stroke={CHART.amber} fill={CHART.amber} fillOpacity={0.72} />
    <Area type="monotone" dataKey="todo" name="A fazer" stackId="flow" stroke={CHART.sage} fill={CHART.sage} fillOpacity={0.62} />
  </AreaChart></ResponsiveContainer>;
}

export function TeamPerformanceComparisonChart({ teams }: { teams: readonly TeamPerformanceSnapshot[] }) {
  const data = teams.map(team => ({
    name: teamLabel(team.teamId),
    throughput: team.delivery.throughput,
    leadTimeP85: team.delivery.leadTimeP85,
  }));
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ bottom: 24 }}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="name" tick={axis} angle={-18} textAnchor="end" interval={0} height={62} />
    <YAxis yAxisId="delivery" allowDecimals={false} tick={axis} />
    <YAxis yAxisId="lead" orientation="right" tick={axis} tickFormatter={(value: number) => `${value}d`} />
    <Tooltip contentStyle={tooltipStyle} /><Legend />
    <Bar yAxisId="delivery" dataKey="throughput" name="Vazão" fill={CHART.primary} radius={[5, 5, 0, 0]} maxBarSize={42} />
    <Line yAxisId="lead" type="monotone" dataKey="leadTimeP85" name="Lead Time P85" stroke={CHART.amber} strokeWidth={2.5} connectNulls />
  </ComposedChart></ResponsiveContainer>;
}
