/**
 * @neo/auth — o contrato de sessão do Portal NEO, em UM lugar.
 *
 * Antes deste pacote, o mesmo HMAC vivia em 4 arquivos (api/session.ts, api/tower.ts,
 * middleware.ts e nero-portal/src/lib/auth.ts) em 2 dialetos (`node:crypto` e Web Crypto),
 * e `verifyBearer` estava inline em 5 functions. É o contrato de segurança do portal:
 * ter uma cópia por arquivo é o pior lugar possível para divergir.
 *
 * REGRA: só Web Crypto (`crypto.subtle`), nunca `node:crypto`. É o que permite o MESMO
 * módulo rodar no Edge Middleware, nas functions Node e no proxy do Next (Nero).
 *
 * FORMATO DO TOKEN (não mudar sem invalidar as sessões vivas):
 *   token   = base64url(JSON.stringify(payload)) + "." + base64url(HMAC-SHA256(payloadB64))
 *   payload = { email?: string, exp: number }   ← exp em MILISSEGUNDOS (Date.now()), não segundos
 * A assinatura cobre a STRING base64url do payload, não o JSON cru.
 */

// ── Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node) ──
export interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

export interface SessionPayload {
  email?: string;
  /** Expiração em milissegundos (Date.now() + ttl). */
  exp: number;
}

// ── base64url sem Buffer (Web APIs; funciona em Edge e Node) ──

function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function utf8ToB64url(text: string): string {
  return bytesToB64url(new TextEncoder().encode(text));
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

// ── Cookies ──

/** Lê um cookie do header `Cookie`. Cookie malformado (ex.: `neo_session=%`) devolve null, nunca lança. */
export function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Monta o `Set-Cookie` do portal: HttpOnly + Secure + SameSite=Lax + Path=/. `maxAge` 0 expira. */
export function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

// ── Token de sessão ──

/** Assina um payload e devolve o token `payload.assinatura`. */
export async function signToken(payload: SessionPayload, secret: string): Promise<string> {
  const encoded = utf8ToB64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, 'sign'),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${bytesToB64url(new Uint8Array(sig))}`;
}

/**
 * Verifica assinatura + expiração. Usa `crypto.subtle.verify`, que já é
 * constant-time — não há comparação de string a proteger aqui.
 */
export async function verifyToken(token: string, secret: string): Promise<boolean> {
  return (await readToken(token, secret)) !== null;
}

/** Como `verifyToken`, mas devolve o payload (para o e-mail de auditoria). null se inválido. */
export async function readToken(token: string, secret: string): Promise<SessionPayload | null> {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      b64urlToBytes(sig) as unknown as ArrayBuffer,
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(encoded))) as SessionPayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// ── Segredos compartilhados (senha da Torre / do Nero) ──

/**
 * Compara dois segredos em tempo constante. Faz SHA-256 dos dois ANTES de comparar, para
 * o laço rodar sempre sobre 32 bytes — assim o tempo não vaza o tamanho da senha.
 */
export async function safeSecretEqual(attempt: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(attempt)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ── Bearer do Supabase + allowlist do NEO ──

/** Extrai o token do header `Authorization: Bearer <jwt>`. */
export function bearerFrom(authorization: string | undefined | null): string {
  const auth = authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

/**
 * Autentica (JWT do Supabase) E autoriza (allowlist do NEO) numa única chamada ao RPC
 * `is_neo_allowed`: o PostgREST rejeita token inválido, e a função retorna true só para
 * @lmmobilidade.com.br ou exceção aprovada em `neo_access`.
 */
export async function verifyBearer(authorization: string | undefined | null): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const token = bearerFrom(authorization);
  if (!token) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_neo_allowed`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return r.ok && (await r.json().catch(() => false)) === true;
  } catch {
    return false;
  }
}

/**
 * Gate das functions: autoriza pelo Bearer quando o Supabase está configurado. Sem env,
 * abre em dev/preview (paridade com o dev local) e FECHA em produção — uma regressão de
 * env nunca deve virar bypass.
 */
export async function isNeoAuthed(authorization: string | undefined | null): Promise<boolean> {
  const configured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  if (configured) return verifyBearer(authorization);
  return process.env.VERCEL_ENV !== 'production';
}

/**
 * E-mail do payload de um JWT, para LOG DE AUDITORIA apenas. É decodificação, não
 * verificação — só chame depois de `verifyBearer`/`verifyToken` terem aprovado.
 */
export function emailFromJwt(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const email = JSON.parse(new TextDecoder().decode(b64urlToBytes(part)))?.email;
    return typeof email === 'string' ? email : null;
  } catch {
    return null;
  }
}
