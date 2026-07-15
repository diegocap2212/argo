// Edge Middleware do Portal NEO: barra /dash/** e /maturity/** (HTML e assets) sem o cookie
// neo_session emitido por /api/session após o login no hub. Roda na borda, antes do filesystem.
// HMAC via Web Crypto (node:crypto não existe no runtime Edge). /api/** fica fora do matcher
// (as functions validam Bearer por conta própria).

export const config = { matcher: ['/dash/:path*', '/maturity/:path*'] };

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

/** Verifica `payload.assinatura` (HMAC-SHA256 base64url — mesmo formato de api/session.ts) + exp. */
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
  // em PRODUÇÃO é misconfiguração e o gate fecha (fail-closed) — nunca libera /dash
  // e /maturity por env sumida. Ver HANDOFF.
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
