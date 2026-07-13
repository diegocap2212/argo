import type { JiraItem } from '../services/dataService';

/**
 * Deriva a lista global de TODOS os times mapeados no dataset (não só os 8 dos agilistas).
 * Recebe os itens carregados de /api/data — não importa o data.json (que sairia no bundle).
 */
export function deriveTeams(items: Array<{ Team?: unknown }>): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const t = typeof item.Team === 'string' ? item.Team.trim() : '';
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export type { JiraItem };
