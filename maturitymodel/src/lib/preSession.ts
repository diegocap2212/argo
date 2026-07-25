// Regras da pré-sessão. Funções puras e testáveis (CLAUDE.md): o gate só habilita
// iniciar a sessão quando TODAS as dimensões têm estágio válido (1–4) E argumento não-vazio.
export interface PreSessionRow {
  dimension_id: string;
  sm_stage: number;
  rationale: string;
}

function isFilled(row: PreSessionRow | undefined): boolean {
  return !!row && row.sm_stage >= 1 && row.sm_stage <= 4 && row.rationale.trim().length > 0;
}

export function isPreSessionComplete(
  dimensionIds: readonly string[],
  assessments: readonly PreSessionRow[],
): boolean {
  if (dimensionIds.length === 0) return false;
  const byDim = new Map(assessments.map((a) => [a.dimension_id, a]));
  return dimensionIds.every((id) => isFilled(byDim.get(id)));
}

export function preSessionProgress(
  dimensionIds: readonly string[],
  assessments: readonly PreSessionRow[],
): { done: number; total: number } {
  const byDim = new Map(assessments.map((a) => [a.dimension_id, a]));
  const done = dimensionIds.filter((id) => isFilled(byDim.get(id))).length;
  return { done, total: dimensionIds.length };
}
