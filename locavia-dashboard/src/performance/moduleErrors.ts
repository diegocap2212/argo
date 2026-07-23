import type { DashboardItem } from '../types/jira';

// ─────────────────────────────────────────────────────────────────────────────
// Análise por Módulo (cf11297) para itens do tipo "Script Manual".
// Espelha o dashboard do Jira "Erro de processo × Jornada / × Status", mas
// filtrável por Módulo e por Jornada. Funções puras (regra do CLAUDE.md).
// ─────────────────────────────────────────────────────────────────────────────

export const SEM_MODULO = 'Sem módulo';
export const SEM_JORNADA = 'Sem jornada';

/** Escopo base do gráfico: issuetype = Script Manual. */
export function isScriptManual(item: DashboardItem): boolean {
  return (item.Type || '').trim().toLocaleLowerCase('pt-BR').includes('script');
}

const moduloOf = (item: DashboardItem) => item.Modulo?.trim() || SEM_MODULO;
const jornadasOf = (item: DashboardItem) => (item.Jornada && item.Jornada.length ? item.Jornada : [SEM_JORNADA]);

export interface Slice {
  name: string;
  value: number;
}

export interface ModuleErrorFilters {
  /** Valor exato do Módulo; '' = todos os módulos. */
  modulo: string;
  /** Jornada exata; '' = todas as jornadas. */
  jornada: string;
}

export interface ModuleErrorView {
  /** Itens distintos no escopo (Script Manual + filtros). */
  total: number;
  /** Fatias por Jornada. Um item conta em CADA jornada sua → a soma pode exceder `total`. */
  byJornada: Slice[];
  /** Fatias por Status (bruto do Jira). */
  byStatus: Slice[];
  /** true quando algum item tem mais de uma jornada (soma das fatias ≠ total). */
  multiJornada: boolean;
}

/** Módulos disponíveis (dentro do escopo Script Manual), ordenados por contagem desc. */
export function listModulos(items: readonly DashboardItem[]): Slice[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!isScriptManual(item)) continue;
    const m = moduloOf(item);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Jornadas disponíveis dentro do Módulo selecionado (para o 2º dropdown). */
export function listJornadas(items: readonly DashboardItem[], modulo: string): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (!isScriptManual(item)) continue;
    if (modulo && moduloOf(item) !== modulo) continue;
    jornadasOf(item).forEach(j => set.add(j));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function computeModuleErrorView(
  items: readonly DashboardItem[],
  filters: ModuleErrorFilters,
): ModuleErrorView {
  const scope = items.filter(item => {
    if (!isScriptManual(item)) return false;
    if (filters.modulo && moduloOf(item) !== filters.modulo) return false;
    if (filters.jornada && !jornadasOf(item).includes(filters.jornada)) return false;
    return true;
  });

  let multiJornada = false;
  const jornada = new Map<string, number>();
  const status = new Map<string, number>();
  for (const item of scope) {
    const js = jornadasOf(item);
    if (js.length > 1) multiJornada = true;
    js.forEach(j => jornada.set(j, (jornada.get(j) ?? 0) + 1));
    const s = (item.Status || '—').trim() || '—';
    status.set(s, (status.get(s) ?? 0) + 1);
  }

  const toSlices = (m: Map<string, number>): Slice[] =>
    [...m.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));

  return { total: scope.length, byJornada: toSlices(jornada), byStatus: toSlices(status), multiJornada };
}

/**
 * Dobra fatias além de `max` num balde "Outros" (mantém a ordem categórica ≤ max+1).
 * Usado pelos donuts para não estourar a paleta validada.
 */
export function foldSlices(slices: readonly Slice[], max = 5): Slice[] {
  if (slices.length <= max) return [...slices];
  const head = slices.slice(0, max);
  const rest = slices.slice(max).reduce((sum, s) => sum + s.value, 0);
  return rest > 0 ? [...head, { name: 'Outros', value: rest }] : head;
}
