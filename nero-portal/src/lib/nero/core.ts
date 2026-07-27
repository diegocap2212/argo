import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "./prompt";
import { toolsForScope, type ToolScope } from "./tool-policy";
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

const ALLOWED_MODELS: readonly string[] = Object.values(NERO_MODELS);

/**
 * O predicado ÚNICO da allowlist. Tudo que decide "este modelo pode?" passa por aqui:
 * a env `NERO_MODEL`, o pedido do cliente em `resolveModel`, e o teste em
 * `scripts/test-nero-core.ts`. Ter uma segunda cópia da lista é como o bug abaixo nasceu.
 */
export function isNeroModelId(value: unknown): value is NeroModelId {
  return typeof value === "string" && ALLOWED_MODELS.includes(value);
}

/**
 * Antes isto era `(process.env.NERO_MODEL as NeroModelId) ?? NERO_MODELS.haiku`, e o
 * `as` é uma MENTIRA para o compilador: não valida nada em runtime. Uma env com ID
 * inválido (typo, modelo descontinuado, alias que não existe) virava o DEFAULT_MODEL
 * efetivo — e `resolveModel` não salvava, porque ele cai justamente no DEFAULT_MODEL.
 * Resultado: a chamada ao SDK saía da allowlist e `pricing.ts` cobrava pela tarifa de
 * FALLBACK, que só é conservadora para modelos DENTRO da lista.
 *
 * Em produção isso aborta: env de modelo errada precisa ser barulhenta. Silenciar e cair
 * no Haiku seria seguro para a fatura, mas esconderia a divergência — você acharia que
 * roda Sonnet enquanto roda Haiku, e a diferença só apareceria na qualidade da resposta.
 * Fora de produção, loga e cai no padrão para não travar o dev com um typo no .env.local.
 */
function resolveDefaultModel(): NeroModelId {
  const env = process.env.NERO_MODEL;
  if (env === undefined || env === "") return NERO_MODELS.haiku;
  if (isNeroModelId(env)) return env;

  const erro =
    `NERO_MODEL="${env}" está fora da allowlist do portal (${ALLOWED_MODELS.join(", ")}). ` +
    `Corrija a env ou acrescente o modelo em NERO_MODELS e na tabela de PRICES.`;
  // VERCEL_ENV (e não NODE_ENV) por paridade com o fail-closed do middleware do NEO:
  // `next build` local também roda com NODE_ENV=production e não deveria abortar.
  if (process.env.VERCEL_ENV === "production") throw new Error(`[Nero] ${erro}`);
  console.error(`[Nero] ${erro} Usando ${NERO_MODELS.haiku} nesta execução.`);
  return NERO_MODELS.haiku;
}

export const DEFAULT_MODEL: NeroModelId = resolveDefaultModel();

/** Valida o modelo pedido pela UI; cai no padrão se vier algo fora da allowlist. */
export function resolveModel(req?: string): NeroModelId {
  return isNeroModelId(req) ? req : DEFAULT_MODEL;
}

/** @deprecated use DEFAULT_MODEL / resolveModel — mantido p/ compat. */
export const NERO_MODEL = DEFAULT_MODEL;

/** Teto de saída por turno. Exportado porque a reserva de orçamento precisa dele para
 *  estimar o custo máximo do turno ANTES da chamada (ver usage.ts / pricing.ts). */
export const MAX_TOKENS = 16000;

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
  opts: { tools?: boolean; scopeContext?: string; model?: string; toolScope?: ToolScope } = {},
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
    // Tools pelo ESCOPO, não o conjunto inteiro sempre. `NERO_TOOLS` cru era passado até no
    // chat tutor da Academia, que assim podia gravar decisão e sobrescrever o catálogo do
    // projeto. Ver lib/nero/tool-policy.ts.
    ...(opts.tools === false
      ? {}
      : (() => {
          const tools = toolsForScope(opts.toolScope ?? "projeto");
          return tools ? { tools } : {};
        })()),
  });
}
