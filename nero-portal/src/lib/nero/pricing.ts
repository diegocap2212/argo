/**
 * Preços por modelo (USD por 1M tokens) e cálculo de custo por turno.
 * Cache: leitura ~0.1× input; escrita (5min) ~1.25× input.
 * Fonte: tabela de preços da Anthropic (jun/2026).
 */

type Rates = { input: number; output: number };

// Só entram modelos que a allowlist de core.ts pode de fato resolver. `claude-opus-4-8`
// estava aqui sem nunca ser alcançável (resolveModel aceita apenas haiku|sonnet) — entrada
// morta, removida. Ao liberar um modelo novo, acrescentar nos DOIS lugares.
//
// `as const satisfies` NÃO é enfeite: com `Record<string, Rates>` o TypeScript tipa
// PRICES["chave-que-nao-existe"] como `Rates` (e não `Rates | undefined`), então uma chave
// errada no FALLBACK abaixo compilava e só explodia em runtime — foi exatamente o que
// aconteceu ao trocar Sonnet 4.6 por Sonnet 5: FALLBACK virou undefined e costOfTurn passou
// a lançar TypeError. Com o tipo literal, chave inexistente é ERRO DE COMPILAÇÃO.
const PRICES = {
  "claude-sonnet-5": { input: 3, output: 15 }, // promocional $2/$10 até 2026-08-31
  "claude-haiku-4-5": { input: 1, output: 5 },
} as const satisfies Record<string, Rates>;

type PricedModel = keyof typeof PRICES;

// Tarifa usada quando o modelo não está na tabela: a MAIS CARA das liberadas, para um
// modelo desconhecido nunca SUBESTIMAR o custo (subestimar afrouxaria o freio de orçamento).
const FALLBACK: Rates = PRICES["claude-sonnet-5"];

export type TurnUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Custo em USD de um turno, dado o modelo e os tokens (incl. cache). */
export function costOfTurn(model: string, u: TurnUsage): number {
  const r: Rates = PRICES[model as PricedModel] ?? FALLBACK;
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
