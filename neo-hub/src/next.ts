/**
 * As QUATRO portas do portal. `nero` faltava aqui um dia: o middleware da raiz preserva
 * `?next=/nero/...` ao barrar a rota, mas o hub descartava esse destino e devolvia a pessoa
 * para a tela de portas. Quem clicava num link direto do Nero autenticava e "perdia" o
 * destino, sem explicação. `admin` entrou com o RBAC pelo mesmo motivo.
 *
 * Esta lista TEM de acompanhar `PORTAL_DOORS` de @neo/auth — um destino ausente aqui não é
 * bloqueado, é silenciosamente esquecido. O contrato está em `packages/neo-auth/test.ts`.
 */
const APP_PATH = /^\/(dash|maturity|nero|admin)(\/|$)/;
const ENCODED_PATH_SEPARATOR = /%(2f|5c|2e)/i;

/** Accept only canonical, same-origin destinations owned by the two portal apps. */
export function safeNextPath(value: string | null): string | null {
  if (!value || !APP_PATH.test(value)) return null;
  if (value.includes('\\') || value.includes('#') || ENCODED_PATH_SEPARATOR.test(value)) return null;

  try {
    const url = new URL(value, 'https://neo.invalid');
    const normalized = `${url.pathname}${url.search}`;
    if (url.origin !== 'https://neo.invalid' || normalized !== value) return null;
    return APP_PATH.test(url.pathname) ? normalized : null;
  } catch {
    return null;
  }
}
