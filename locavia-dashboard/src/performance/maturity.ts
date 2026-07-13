import type { TeamPerformanceSnapshot } from './types';

export interface MaturityAssessment {
  level: number;
  score: number;
  dimensions: Record<string, number>;
}

/** Contrato que o modelo de maturidade deve implementar quando estiver disponível. */
export interface MaturityProvider {
  assess(snapshot: Readonly<TeamPerformanceSnapshot>): MaturityAssessment | Promise<MaturityAssessment>;
}

export function attachMaturity(
  snapshot: TeamPerformanceSnapshot,
  assessment: MaturityAssessment,
): TeamPerformanceSnapshot {
  if (!Number.isFinite(assessment.level) || !Number.isFinite(assessment.score)) {
    throw new Error('Avaliação de maturidade inválida.');
  }
  return { ...snapshot, maturity: { ...assessment, dimensions: { ...assessment.dimensions } } };
}
