import type { DashboardItem } from '../types/jira';
import type { PerformancePeriod } from './types';
import type { PerformanceTrendPoint } from './trends';

// Funções puras para a aba "Análise de Fluxo". Reaproveitam os mesmos utilitários de data e
// percentil do resto de src/performance/ (duplicados aqui como em trends.ts, sem acoplar).

const DAY_MS = 86_400_000;
const TERMINAL_DISCARDED = new Set(['CANCELADO', 'DESCARTADO']);

// Etapas de trabalho do fluxo, na ordem — "Concluído" fica de fora (é o fim, não tempo de ciclo).
// Os nomes batem com as chaves de item.TimeInStatus gravadas pelo sync (classifyStage).
export const FLOW_STAGES = ['Backlog', 'Desenvolvimento', 'QA', 'Homologação/Deploy'] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

const isDiscarded = (item: DashboardItem) => TERMINAL_DISCARDED.has(item.Status.toUpperCase());

// ── 1. Dispersão de Lead Time (control chart) ────────────────────────────────
export interface LeadTimePoint {
  key: string;
  team: string;
  summary: string;
  resolvedAt: number; // epoch ms — eixo X (tempo)
  leadTime: number;   // dias — eixo Y
  outlier: boolean;   // acima do P85
}
export interface LeadTimeScatter {
  points: LeadTimePoint[];
  p50: number | null;
  p85: number | null;
}

export function computeLeadTimeScatter(items: readonly DashboardItem[], period: PerformancePeriod): LeadTimeScatter {
  const start = parseDate(period.start);
  const end = parseDate(period.end);
  const inPeriod = (d: Date | null) => d !== null && (!start || d >= start) && (!end || d <= end);

  const delivered = items.filter(item =>
    item.StatusCategory === 'DONE' && !isDiscarded(item) && inPeriod(parseDate(item.Resolved)) && (item.LeadTime ?? null) !== null,
  );
  const leadTimes = delivered.map(item => item.LeadTime as number);
  const p85 = percentile(leadTimes, 0.85);
  const p50 = percentile(leadTimes, 0.5);

  const points: LeadTimePoint[] = delivered.map(item => ({
    key: item.Key,
    team: item.Team,
    summary: typeof item.Summary === 'string' ? item.Summary : String(item.Summary ?? ''),
    resolvedAt: (parseDate(item.Resolved) as Date).getTime(),
    leadTime: item.LeadTime as number,
    outlier: p85 !== null && (item.LeadTime as number) > p85,
  })).sort((a, b) => a.resolvedAt - b.resolvedAt);

  return { points, p50: p50 === null ? null : Math.round(p50), p85: p85 === null ? null : Math.round(p85) };
}

// ── 2. Vazão × Lead Time (série temporal: entregas vs tempo, semana a semana) ─
export interface ThroughputLeadPoint {
  label: string;
  throughput: number;
  leadTimeP85: number | null;
}

export function computeThroughputVsLeadTime(trend: readonly PerformanceTrendPoint[]): ThroughputLeadPoint[] {
  return trend.map(p => ({ label: p.label, throughput: p.throughput, leadTimeP85: p.leadTimeP85 }));
}

// ── 3. Cycle time por etapa (waterfall) ──────────────────────────────────────
export interface StageDuration {
  stage: FlowStage;
  avg: number; // dias
  p85: number; // dias
  share: number; // % do tempo total (média) — destaca o gargalo
}

export function computeStageDurations(items: readonly DashboardItem[], period: PerformancePeriod): StageDuration[] {
  const start = parseDate(period.start);
  const end = parseDate(period.end);
  const inPeriod = (d: Date | null) => d !== null && (!start || d >= start) && (!end || d <= end);

  // Itens entregues no período que têm decomposição de tempo por etapa.
  const delivered = items.filter(item =>
    item.StatusCategory === 'DONE' && !isDiscarded(item) && inPeriod(parseDate(item.Resolved)) &&
    item.TimeInStatus && Object.keys(item.TimeInStatus).length > 0,
  );

  const rows = FLOW_STAGES.map<StageDuration>(stage => {
    const daysValues = delivered
      .map(item => (item.TimeInStatus?.[stage] ?? 0) / 24) // horas → dias
      .filter(v => v > 0);
    const avg = daysValues.length ? daysValues.reduce((s, v) => s + v, 0) / daysValues.length : 0;
    const p85 = percentile(daysValues, 0.85) ?? 0;
    return { stage, avg: Math.round(avg * 10) / 10, p85: Math.round(p85 * 10) / 10, share: 0 };
  });

  const totalAvg = rows.reduce((s, r) => s + r.avg, 0);
  return rows.map(r => ({ ...r, share: totalAvg ? Math.round((r.avg / totalAvg) * 100) : 0 }));
}

// ── 4. Aging heatmap (times × faixas de idade do WIP) ────────────────────────
export const AGING_BUCKETS = ['0–7d', '8–14d', '15–30d', '31d+'] as const;
export interface AgingHeatRow {
  team: string;
  buckets: number[]; // contagem por faixa, alinhado a AGING_BUCKETS
  total: number;
}

export function computeAgingHeatmap(items: readonly DashboardItem[], teamIds: readonly string[], now: Date): AgingHeatRow[] {
  const rows = teamIds.map<AgingHeatRow>(team => {
    const buckets = [0, 0, 0, 0];
    for (const item of items) {
      if (item.Team.trim() !== team) continue;
      if (item.StatusCategory !== 'IN_PROGRESS') continue;
      const started = parseDate(item.StartDate) ?? parseDate(item.Created);
      if (!started || started > now) continue;
      const age = Math.floor((now.getTime() - started.getTime()) / DAY_MS);
      const index = age <= 7 ? 0 : age <= 14 ? 1 : age <= 30 ? 2 : 3;
      buckets[index]++;
    }
    return { team, buckets, total: buckets.reduce((s, v) => s + v, 0) };
  });
  // Ordena por WIP crítico (31d+) e total, para os times mais problemáticos aparecerem no topo.
  return rows.filter(r => r.total > 0).sort((a, b) => b.buckets[3] - a.buckets[3] || b.total - a.total);
}

// ── 5. Cards mais problemáticos (drill-down acionável) ───────────────────────
export interface AttentionItem {
  key: string;
  summary: string;
  team: string;
  status: string;
  days: number; // idade em andamento
  reason: string;
  severity: 'attention' | 'critical';
}

export function computeAttentionItems(items: readonly DashboardItem[], now: Date, limit = 8): AttentionItem[] {
  const wip = items.filter(item => item.StatusCategory === 'IN_PROGRESS' && !isDiscarded(item));
  const scored = wip.map(item => {
    const started = parseDate(item.StartDate) ?? parseDate(item.Created);
    const days = started ? Math.floor((now.getTime() - started.getTime()) / DAY_MS) : 0;
    const severity: 'attention' | 'critical' = days > 30 ? 'critical' : 'attention';
    return {
      key: item.Key,
      summary: typeof item.Summary === 'string' ? item.Summary : String(item.Summary ?? ''),
      team: item.Team,
      status: item.Status,
      days,
      reason: `Em "${item.Status}" há ${days} dias`,
      severity,
    };
  });
  return scored
    .filter(i => i.days >= 15) // só o que realmente exige atenção
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}
