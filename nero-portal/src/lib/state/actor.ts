import { headers } from "next/headers";

/**
 * Identidade INDIVIDUAL de quem está operando.
 *
 * O problema (achado 7.4): o token do NEO carrega o e-mail — `readToken` do @neo/auth existe
 * exatamente "para o e-mail de auditoria" — mas o Nero só verificava a assinatura de forma
 * booleana. Toda mutação gravava `actor = "nero" | "analista"`, ou seja TIPO DE ATOR, não
 * pessoa. Duas pessoas diferentes ficavam indistinguíveis na trilha, enquanto os documentos
 * do produto falavam de "quem/quando".
 *
 * O e-mail chega por um header que o PROXY injeta depois de validar o cookie assinado (ver
 * src/proxy.ts). O proxy apaga qualquer valor que tenha vindo do cliente antes de escrever o
 * seu, então este header não é forjável de fora — mas ele só é confiável porque o proxy roda
 * antes de tudo. Nunca aceite este header sem o proxy na frente.
 */
export const ACTOR_EMAIL_HEADER = "x-neo-actor-email";

/**
 * E-mail do operador, ou `null` fora de um request (scripts, seed, testes).
 *
 * `headers()` só existe dentro do ciclo de request do Next; em `tsx scripts/...` ele lança.
 * Daí o try/catch: a auditoria degrada para "sem identidade" em vez de derrubar o script.
 */
export async function currentActorEmail(): Promise<string | null> {
  try {
    const h = await headers();
    const email = h.get(ACTOR_EMAIL_HEADER);
    return email && email.includes("@") ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}
