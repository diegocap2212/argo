import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "./prompt";
import { NERO_TOOLS } from "./tools";
import { assertWithinBudget } from "./usage";

/**
 * Nero Core — o ÚNICO ponto de IA do portal. Toda interação com o Claude passa
 * por aqui. UI e features nunca chamam o modelo direto.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Modelos liberados no portal. Haiku 4.5 é o padrão (rápido e barato, cabe melhor
 * no teto de 60s do deploy); Sonnet 5 é a alternativa para tarefas mais densas.
 * IDs sem sufixo de data (aliases) — ambos existem na tabela de preços (pricing.ts).
 *
 * Sonnet 4.6 -> Sonnet 5: mesmo preço de tabela ($3/$15 por 1M) com qualidade bem maior
 * em tarefas densas, e ainda em preço promocional ($2/$10) até 2026-08-31. Atenção ao
 * migrar: o Sonnet 5 usa tokenizer novo (~30% mais tokens para o mesmo texto), então o
 * custo por turno sobe mesmo com o preço por token igual — o freio de orçamento acima é
 * justamente o que impede isso de virar surpresa na fatura.
 */
export const NERO_MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
} as const;

export type NeroModelId = (typeof NERO_MODELS)[keyof typeof NERO_MODELS];

export const DEFAULT_MODEL: NeroModelId =
  (process.env.NERO_MODEL as NeroModelId) ?? NERO_MODELS.haiku;

/** Valida o modelo pedido pela UI; cai no padrão se vier algo fora da allowlist. */
export function resolveModel(req?: string): NeroModelId {
  return req === NERO_MODELS.sonnet || req === NERO_MODELS.haiku
    ? (req as NeroModelId)
    : DEFAULT_MODEL;
}

/** @deprecated use DEFAULT_MODEL / resolveModel — mantido p/ compat. */
export const NERO_MODEL = DEFAULT_MODEL;

const MAX_TOKENS = 16000;

export type NeroMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Marca a última mensagem com cache_control para CACHE DE HISTÓRICO:
 * em turnos seguintes, o prefixo da conversa é lido do cache (~10% do custo).
 */
function withHistoryCache(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  if (typeof last.content === "string") {
    out[out.length - 1] = {
      role: last.role,
      content: [
        { type: "text", text: last.content, cache_control: { type: "ephemeral" } },
      ],
    };
  }
  return out;
}

/**
 * Abre o stream de UM turno do Nero.
 *
 * @param opts.scopeContext - Bloco de texto compacto do step do roadmap (carregado
 *   pela rota de chat). Injetado como bloco de sistema NÃO cacheado após o prefixo
 *   estável, para que o Nero responda no contexto daquela fase sem poluir o cache.
 */
export async function streamTurn(
  messages: Anthropic.MessageParam[],
  opts: { tools?: boolean; scopeContext?: string; model?: string } = {},
) {
  // FREIO de orçamento. Aqui e não na rota HTTP porque este é o único ponto de IA do
  // portal: o chat (laço agêntico) e o generate.ts do report passam os dois por aqui,
  // então um só guarda cobre todas as chamadas ao modelo. Lança BudgetExceededError.
  await assertWithinBudget();

  const baseSystem = await buildSystem();
  const system: Anthropic.TextBlockParam[] = opts.scopeContext
    ? [...baseSystem, { type: "text", text: opts.scopeContext }]
    : baseSystem;

  return getClient().messages.stream({
    model: resolveModel(opts.model),
    max_tokens: MAX_TOKENS,
    system,
    messages: withHistoryCache(messages),
    ...(opts.tools === false ? {} : { tools: NERO_TOOLS }),
  });
}
