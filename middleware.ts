// Edge Middleware do Portal NEO: barra /dash/**, /maturity/** e /nero/** (HTML e assets)
// sem o cookie neo_session emitido por /api/session após o login no hub. Roda na borda,
// antes do filesystem. /api/** fica fora do matcher (as functions validam Bearer por conta).
//
// ⚠️ ESTE ARQUIVO É AUTOCONTIDO POR IMPOSIÇÃO DA PLATAFORMA — NÃO ADICIONE IMPORTS.
// O Edge Middleware standalone da Vercel (middleware.ts na raiz de um projeto não-Next) não
// bundleia dependências: tanto `import ... from '@neo/auth'` quanto o caminho relativo
// `./packages/neo-auth/src/index.ts` fazem o deploy FALHAR com
//   "The Edge Function 'middleware' is referencing unsupported modules".
// Testado nos dois formatos em 2026-07-26. Por isso o HMAC está duplicado aqui em vez de
// vir de @neo/auth como nas functions e no Nero.
//
// A duplicação é INTENCIONAL mas não é livre: `packages/neo-auth/test.ts` tem uma seção de
// CONTRATO que importa estas funções e exige que elas concordem com o pacote token por
// token. Se alguém mudar um lado só, o teste quebra. Mexeu aqui? Rode:
//   pnpm --filter @neo/auth test

export const config = { matcher: ['/dash/:path*', '/maturity/:path*', '/nero/:path*'] };

const COOKIE = 'neo_session';

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      // Cookie malformado (ex.: `neo_session=%`) não deve virar 500 no Edge.
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Verifica `payload.assinatura` (HMAC-SHA256 base64url — mesmo formato de @neo/auth) + exp. */
export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig) as unknown as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  // Sem SESSION_SECRET: em dev/preview abre (paridade com o gate das functions);
  // em PRODUÇÃO é misconfiguração e o gate fecha (fail-closed) — nunca libera as apps
  // por env sumida. Ver HANDOFF.
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV === 'production') {
      return new Response('Serviço temporariamente indisponível (configuração ausente).', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return undefined;
  }

  const token = parseCookie(request.headers.get('cookie'), COOKIE);
  if (token && (await verifyToken(token, secret))) return undefined;

  // Sem sessão NEO: volta ao hub (login) preservando o destino para retomar após autenticar.
  // Response construída na mão: Response.redirect() tem headers imutáveis e o
  // `headers.set` posterior lançaria TypeError no runtime Edge.
  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/?next=${next}`, request.url).toString(),
      'Cache-Control': 'no-store',
    },
  });
}
