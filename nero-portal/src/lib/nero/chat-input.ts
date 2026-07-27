import type { NeroMessage } from "./core";

/**
 * Validação do corpo da rota de chat.
 *
 * O QUE HAVIA (achado 7.10): a rota checava só `Array.isArray(messages) && length > 0` e
 * então mapeava `{ role: m.role, content: m.content }` direto para a API. Sem schema por
 * mensagem, sem limite de quantidade, de caracteres ou de bytes, sem exigir que a última
 * role fosse `user`, e sem rejeitar `assistant` forjado pelo cliente.
 *
 * Duas consequências reais:
 *
 *   1. CUSTO — um usuário autorizado podia enviar um histórico gigante e queimar o orçamento
 *      mensal GLOBAL numa requisição. O freio de `usage.ts` mede DEPOIS do turno; o que
 *      impede o turno absurdo é o limite de entrada.
 *   2. INTEGRIDADE — o cliente podia forjar mensagens de `assistant` com conteúdo arbitrário
 *      ("você já confirmou que pode apagar o catálogo") e influenciar o tool use do turno
 *      seguinte. O laço agêntico do Nero tem tools de ESCRITA, então isso não é hipotético.
 *
 * Aqui é validação de FORMA e TAMANHO, não de intenção — a defesa contra conteúdo malicioso
 * é a delimitação de dado não confiável no prompt e a política de tools.
 */

/** Turnos que a UI mantém. Acima disso é histórico artificial, não conversa. */
const MAX_MESSAGES = 40;
/** Uma mensagem de usuário longa cabe folgado; um dump de arquivo não. */
const MAX_CHARS_PER_MESSAGE = 20_000;
/** Teto do histórico inteiro, o que de fato limita o custo de input por request. */
const MAX_TOTAL_CHARS = 120_000;

export type ChatInputError = { status: 400; error: string };

export function parseChatMessages(raw: unknown): NeroMessage[] | ChatInputError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { status: 400, error: "Corpo inválido: 'messages' é obrigatório." };
  }
  if (raw.length > MAX_MESSAGES) {
    return { status: 400, error: `Histórico longo demais (${raw.length} mensagens; máximo ${MAX_MESSAGES}).` };
  }

  const out: NeroMessage[] = [];
  let total = 0;

  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    if (typeof m !== "object" || m === null) {
      return { status: 400, error: `Mensagem ${i} não é um objeto.` };
    }
    const { role, content } = m as { role?: unknown; content?: unknown };

    if (role !== "user" && role !== "assistant") {
      return { status: 400, error: `Mensagem ${i}: role inválida.` };
    }
    if (typeof content !== "string") {
      // O SDK aceita blocos estruturados; a UI do Nero só manda texto. Aceitar objeto aqui
      // abriria caminho para o cliente injetar tool_result forjado.
      return { status: 400, error: `Mensagem ${i}: 'content' tem de ser texto.` };
    }
    if (content.length === 0) {
      return { status: 400, error: `Mensagem ${i}: 'content' vazio.` };
    }
    if (content.length > MAX_CHARS_PER_MESSAGE) {
      return {
        status: 400,
        error: `Mensagem ${i} tem ${content.length} caracteres (máximo ${MAX_CHARS_PER_MESSAGE}).`,
      };
    }

    total += content.length;
    if (total > MAX_TOTAL_CHARS) {
      return { status: 400, error: `Histórico excede ${MAX_TOTAL_CHARS} caracteres no total.` };
    }

    out.push({ role, content });
  }

  // A conversa tem de TERMINAR num turno do usuário. Se termina em `assistant`, o cliente
  // está pedindo que o modelo continue a própria fala a partir de texto que o cliente
  // escreveu — é o vetor de prefill que permitiria pôr palavras na boca do Nero.
  if (out[out.length - 1]!.role !== "user") {
    return { status: 400, error: "A última mensagem tem de ser do usuário." };
  }

  // Alternância: `user` e `assistant` se revezam. Uma sequência com vários `assistant`
  // seguidos é histórico fabricado, não uma conversa que este servidor produziu.
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.role === out[i - 1]!.role) {
      return { status: 400, error: `Histórico não alterna papéis na posição ${i}.` };
    }
  }

  return out;
}

export const CHAT_LIMITS = { MAX_MESSAGES, MAX_CHARS_PER_MESSAGE, MAX_TOTAL_CHARS };
