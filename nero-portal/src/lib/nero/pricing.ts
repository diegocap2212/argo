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
/**
 * PREÇO PROMOCIONAL DO SONNET 5 — vigente até 2026-08-31.
 *
 * A tabela cobrava $3/$15 (preço de lista) enquanto o comentário ao lado reconhecia o
 * promocional de $2/$10. Não inflava a fatura — inflava a CONTABILIDADE: o freio de orçamento
 * fechava com ~50% a menos de uso real, e o medidor/projeção mostravam gasto maior do que a
 * Anthropic cobra. Num teto de US$ 20/mês, isso é o Nero parar de responder achando que
 * gastou o dobro.
 *
 * QUANDO O PROMOCIONAL ACABAR (após 2026-08-31): voltar `claude-sonnet-5` para
 * `{ input: 3, output: 15 }`. O teste `scripts/test-nero-core.ts` tem um caso que falha
 * depois da data, para isto não passar batido.
 */
const PRICES = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
} as const satisfies Record<string, Rates>;

/** Fim do preço promocional do Sonnet 5. Lido pelo teste, não pela lógica de cobrança. */
export const SONNET_PROMO_ENDS = "2026-08-31T23:59:59Z";

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

/**
 * Custo MÁXIMO plausível de UM turno — o valor que a reserva atômica grava antes da chamada.
 *
 * Por que precisa existir: o freio era só uma LEITURA do gasto. Requisições concorrentes
 * liam o mesmo saldo e passavam todas juntas, cada uma achando que havia orçamento. Reservar
 * o pior caso antes de chamar o modelo torna o gasto visível para os outros leitores no
 * mesmo instante; depois `settleTurn` troca a estimativa pelo consumo real.
 *
 * Superestimar é a direção segura: o erro fecha o freio um pouco antes, nunca depois. E a
 * reserva vive só até a reconciliação do próprio turno.
 */
export function maxTurnCostUsd(model: string, maxOutputTokens: number): number {
  const r: Rates = PRICES[model as PricedModel] ?? FALLBACK;
  const output = (maxOutputTokens * r.output) / 1_000_000;
  // Folga de entrada: o prefixo do kit é grande mas vem do cache (~0.1× input), e sobra
  // espaço para o histórico não cacheado. Cobre o pior turno observado com margem.
  const input = (200_000 * r.input * 0.1 + 20_000 * r.input) / 1_000_000;
  return output + input;
}

/** Orçamento mensal alvo (USD). Configurável por env. */
export function monthlyBudgetUsd(): number {
  const v = Number(process.env.NERO_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 20;
}

/**
 * Teto mensal POR PESSOA (USD). Antes só existia o teto global, então uma pessoa sozinha
 * podia consumir o mês do time inteiro — não por malícia, basta um laço agêntico longo num
 * dia de discovery.
 *
 * Sem env, cai em metade do global: um teto individual acima da metade não protege ninguém
 * (dois usuários já estouram), e abaixo disso engessa um time pequeno.
 */
export function userMonthlyBudgetUsd(): number {
  const v = Number(process.env.NERO_USER_MONTHLY_BUDGET_USD);
  if (Number.isFinite(v) && v > 0) return v;
  return monthlyBudgetUsd() / 2;
}
