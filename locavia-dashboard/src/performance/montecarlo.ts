import type { DashboardItem } from '../types/jira';
import type { PerformanceTrendPoint } from './trends';

// Monte Carlo de forecasting ágil (método Vacanti/Magennis): reamostra a vazão semanal
// histórica milhares de vezes para gerar uma distribuição de resultados e extrair percentis
// de confiança — em vez de uma média única e enganosa. Funções puras.

const TERMINAL_DISCARDED = new Set(['CANCELADO', 'DESCARTADO']);
const DEFAULT_TRIALS = 10_000;
const WEEK_CAP = 520; // guarda contra loop infinito (ex.: histórico só de zeros)

export interface HistogramBar { value: number; count: number; cumulative: number }
export interface ForecastResult {
  p50: number;
  p70: number;
  p85: number;
  p95: number;
  histogram: HistogramBar[];
  trials: number;
}

/** Backlog restante do time: itens não concluídos e não descartados. */
export function remainingBacklog(items: readonly DashboardItem[]): number {
  return items.filter(i => i.StatusCategory !== 'DONE' && !TERMINAL_DISCARDED.has(i.Status.toUpperCase())).length;
}

/** Vazão por semana (amostras da simulação). Inclui semanas com 0 — a variabilidade é real. */
export function weeklyThroughputSamples(trend: readonly PerformanceTrendPoint[]): number[] {
  return trend.map(p => p.throughput);
}

function histogram(sorted: number[], maxBars = 24): HistogramBar[] {
  if (sorted.length === 0) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = Math.max(1, max - min);
  const step = Math.max(1, Math.ceil(span / maxBars));
  const buckets = new Map<number, number>();
  for (const v of sorted) {
    const bucket = min + Math.floor((v - min) / step) * step;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  let acc = 0;
  return [...buckets.keys()].sort((a, b) => a - b).map(value => {
    acc += buckets.get(value) ?? 0;
    return { value, count: buckets.get(value) ?? 0, cumulative: Math.round((acc / sorted.length) * 100) };
  });
}

const EMPTY: ForecastResult = { p50: 0, p70: 0, p85: 0, p95: 0, histogram: [], trials: 0 };

/**
 * "Quando entregamos N itens?" → distribuição de SEMANAS necessárias.
 * Percentis = confiança de concluir em ATÉ X semanas (maior percentil = mais conservador).
 */
export function forecastWhen(weekly: readonly number[], backlog: number, trials = DEFAULT_TRIALS): ForecastResult {
  if (backlog <= 0 || weekly.length === 0 || weekly.every(w => w <= 0)) return EMPTY;
  const results: number[] = new Array(trials);
  for (let t = 0; t < trials; t++) {
    let remaining = backlog;
    let weeks = 0;
    while (remaining > 0 && weeks < WEEK_CAP) {
      remaining -= weekly[(Math.random() * weekly.length) | 0];
      weeks++;
    }
    results[t] = weeks;
  }
  results.sort((a, b) => a - b);
  const at = (p: number) => results[Math.min(results.length - 1, Math.floor(results.length * p))];
  return { p50: at(0.5), p70: at(0.7), p85: at(0.85), p95: at(0.95), histogram: histogram(results), trials };
}

/**
 * "Quantos itens em D semanas?" → distribuição de ITENS entregues.
 * Percentis = confiança de entregar AO MENOS X itens (maior confiança = menos itens).
 */
export function forecastHowMany(weekly: readonly number[], weeks: number, trials = DEFAULT_TRIALS): ForecastResult {
  if (weeks <= 0 || weekly.length === 0) return EMPTY;
  const results: number[] = new Array(trials);
  for (let t = 0; t < trials; t++) {
    let total = 0;
    for (let w = 0; w < weeks; w++) total += weekly[(Math.random() * weekly.length) | 0];
    results[t] = total;
  }
  results.sort((a, b) => a - b);
  // "ao menos": confiança C → percentil (1 - C)
  const atLeast = (c: number) => results[Math.max(0, Math.floor(results.length * (1 - c)))];
  return { p50: atLeast(0.5), p70: atLeast(0.7), p85: atLeast(0.85), p95: atLeast(0.95), histogram: histogram(results), trials };
}
