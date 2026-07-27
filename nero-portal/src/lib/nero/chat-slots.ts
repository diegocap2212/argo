/**
 * Limite de conversas SIMULTÂNEAS por pessoa.
 *
 * Por que existe: o teto mensal (global e por pessoa) é sobre VOLUME acumulado. Ele não
 * impede alguém abrir 20 abas e disparar 20 laços agênticos ao mesmo tempo — todos reservam
 * orçamento antes de qualquer um reconciliar, então o pico de gasto e de carga acontece
 * dentro da mesma janela. Este guarda limita a concorrência, que é a dimensão que o teto não
 * cobre.
 *
 * ESCOPO HONESTO: memória do processo. Instâncias diferentes da função têm mapas diferentes,
 * então isto é amortecedor de abuso ACIDENTAL (aba duplicada, clique repetido, retry
 * agressivo do cliente), não controle distribuído. O limite duro de custo é a reserva atômica
 * em `usage.ts`, que passa pelo banco.
 */

/** Conversas simultâneas por pessoa. 2 cobre "reabri a aba" sem liberar paralelismo real. */
const MAX_CONCURRENT_PER_ACTOR = 2;

/** Teto para requisições sem identidade (dev sem SESSION_SECRET, scripts). */
const MAX_CONCURRENT_ANON = 4;

const active = new Map<string, number>();

/**
 * Tenta ocupar um slot. Devolve a função de liberação, ou `null` se a pessoa já está no
 * limite. O chamador PRECISA chamar a liberação num `finally` — senão o slot vaza e a pessoa
 * fica travada até a instância reciclar.
 */
export function acquireChatSlot(actorEmail: string | null): (() => void) | null {
  const key = actorEmail ?? "__anon__";
  const limit = actorEmail ? MAX_CONCURRENT_PER_ACTOR : MAX_CONCURRENT_ANON;
  const current = active.get(key) ?? 0;
  if (current >= limit) return null;

  active.set(key, current + 1);
  let released = false;
  return () => {
    // Idempotente: o stream pode fechar por caminhos diferentes (fim normal, erro, abort) e
    // liberar duas vezes zeraria o contador de outra requisição em voo.
    if (released) return;
    released = true;
    const n = (active.get(key) ?? 1) - 1;
    if (n <= 0) active.delete(key);
    else active.set(key, n);
  };
}

export const CHAT_SLOT_LIMITS = { MAX_CONCURRENT_PER_ACTOR, MAX_CONCURRENT_ANON };
