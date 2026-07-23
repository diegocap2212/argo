import type { DashboardItem } from '../types/jira';

// ─────────────────────────────────────────────────────────────────────────────
// ESCOPO OPERACIONAL das métricas de performance.
// Só entram issuetypes de trabalho de desenvolvimento: US (História), Task (Tarefa),
// Bug e Spike. Ficam de FORA: UAT, Script Manual, GMUD, HOTFIX, Ideia, Melhoria,
// Release, etc. — não representam vazão operacional do time.
//
// Aplicado na camada de dados (hooks usePerformancePortfolio / useTeamPerformance),
// então TODO o operacional (vazão, lead/cycle, WIP, aging, CFD, story points,
// previsibilidade, saúde, insights, previsão, comparativos da Torre) usa o mesmo
// recorte. A tela /modulos (Script Manual por módulo) NÃO usa este filtro.
// ─────────────────────────────────────────────────────────────────────────────
const OPERATIONAL_SUBSTRINGS = ['hist', 'tarefa', 'bug', 'spike'];

export function isOperationalType(type: string | null | undefined): boolean {
  const t = (type || '').trim().toLocaleLowerCase('pt-BR');
  return OPERATIONAL_SUBSTRINGS.some(s => t.includes(s));
}

export function operationalItems(items: readonly DashboardItem[]): DashboardItem[] {
  return items.filter(item => isOperationalType(item.Type));
}
