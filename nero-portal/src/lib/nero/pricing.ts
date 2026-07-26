/**
 * Preços por modelo (USD por 1M tokens) e cálculo de custo por turno.
 * Cache: leitura ~0.1× input; escrita (5min) ~1.25× input.
 * Fonte: tabela de preços da Anthropic (jun/2026).
 */

type Rates = { input: number; output: number };

const PRICES: Record<string, Rates> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

const FALLBACK: Rates = PRICES["claude-sonnet-4-6"];

export type TurnUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Custo em USD de um turno, dado o modelo e os tokens (incl. cache). */
export function costOfTurn(model: string, u: TurnUsage): number {
  const r = PRICES[model] ?? FALLBACK;
  const cost =
    (u.inputTokens * r.input +
      u.outputTokens * r.output +
      u.cacheReadTokens * (r.input * 0.1) +
      u.cacheWriteTokens * (r.input * 1.25)) /
    1_000_000;
  return cost;
}

/** Orçamento mensal alvo (USD). Configurável por env. */
export function monthlyBudgetUsd(): number {
  const v = Number(process.env.NERO_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 20;
}
