import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "./prompt";
import { NERO_TOOLS } from "./tools";

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
 * no teto de 60s do deploy); Sonnet 4.6 é a alternativa para tarefas mais densas.
 * IDs sem sufixo de data (aliases) — ambos existem na tabela de preços (pricing.ts).
 */
export const NERO_MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
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
