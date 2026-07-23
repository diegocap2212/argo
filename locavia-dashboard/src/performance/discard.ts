// Fonte ÚNICA do predicado de "descartado/cancelado" no runtime.
// Espelha DISCARD_STATUS_NAMES do sync (status-classification.ts): match por
// SUBSTRING para pegar variantes reais do Jira ("DESCARTADOS", "CANCELADO ❌").
// Descartados nunca contam como entrega nem como entrada de fluxo.
const DISCARDED_ROOTS = ['CANCELAD', 'DESCARTAD'];

export function isDiscardedStatus(status: string | null | undefined): boolean {
  const s = (status || '').toUpperCase();
  return DISCARDED_ROOTS.some(root => s.includes(root));
}
