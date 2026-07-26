/**
 * Gate de acesso por senha única (compartilhada pela equipe).
 * - O cookie de sessão é um HMAC-SHA256 de uma constante, assinado com SESSION_SECRET
 *   (server-only) — não guarda a senha e não é forjável sem o segredo.
 * - Usa Web Crypto (crypto.subtle), compatível com Edge middleware E Node.
 */

export const SESSION_COOKIE = "nero_session";
const PAYLOAD = "nero-session-v1";

async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Valor esperado do cookie quando autenticado. */
export async function makeSessionToken(): Promise<string> {
  return hmacHex(process.env.SESSION_SECRET ?? "", PAYLOAD);
}

/** Verifica o cookie de sessão. */
export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.SESSION_SECRET) return false;
  const expected = await makeSessionToken();
  return timingSafeEqual(token, expected);
}

/** Confere a senha enviada no login contra APP_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD ?? "";
  return pw.length > 0 && timingSafeEqual(input, pw);
}
