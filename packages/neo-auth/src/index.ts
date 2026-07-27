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

/**
 * Para que serve cada token. Um token de `tower` NÃO pode ser aceito como `neo_session`.
 *
 * Antes desta distinção, os três cookies (`neo_session`, `neo_tower`, `neo_nero`) eram
 * assinados com o MESMO `SESSION_SECRET` e os verificadores só checavam assinatura + `exp`.
 * Qualquer token válido servia em qualquer trava: o teste de contrato deste pacote até
 * AFIRMAVA que um token emitido pela função de sessão passava no verificador do gate. Copiar
 * o valor de um cookie para outro era escalada de privilégio.
 */
export type TokenPurpose = 'neo_session' | 'tower' | 'nero';

export interface SessionPayload {
  email?: string;
  /** Expiração em milissegundos (Date.now() + ttl). */
  exp: number;
  /**
   * Propósito do token. Redundante com a subchave HKDF (um token de outro propósito nem
   * verifica), e é isso que se quer: a criptografia garante, e o campo torna o erro legível
   * em log em vez de "assinatura inválida" sem explicação.
   */
  purpose?: TokenPurpose;
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

/**
 * Salt do HKDF. Fixo e público de propósito — a força vem do `SESSION_SECRET`, não do salt.
 * Serve também como MARCA DE VERSÃO: mudar esta string invalida todos os tokens emitidos.
 */
const HKDF_SALT = 'neo-portal/token-subkey/v1';

/**
 * Subchave HMAC derivada por propósito (HKDF-SHA256, `info` = propósito).
 *
 * POR QUE HKDF E NÃO SÓ UM CAMPO `purpose` NO PAYLOAD: com um campo, a proteção depende de
 * TODO verificador lembrar de conferi-lo — e são quatro lugares (este pacote, `middleware.ts`,
 * `api/gate.ts`, `api/session.ts`), três deles cópias autocontidas por imposição da Vercel.
 * Um esquecimento reabre a confusão em silêncio. Com subchave, um token de `tower` FALHA a
 * verificação como `neo_session`: a assinatura foi feita com outra chave. A garantia passa a
 * ser da construção, não da disciplina de quem escreve o próximo verificador.
 *
 * `deriveBits` + `importKey`: `deriveKey` direto para HMAC não é suportado de forma
 * consistente entre o runtime Edge e o Node.
 */
async function hmacKey(
  secret: string,
  purpose: TokenPurpose,
  usage: 'sign' | 'verify',
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(HKDF_SALT),
      info: new TextEncoder().encode(purpose),
    },
    material,
    256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
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

/**
 * Assina um payload para UM propósito e devolve o token `payload.assinatura`.
 *
 * `purpose` é parâmetro OBRIGATÓRIO, não opção: assim o compilador aponta todo emissor quando
 * um propósito novo aparecer, em vez de deixar um cair no default e ser aceito onde não devia.
 */
export async function signToken(
  payload: SessionPayload,
  secret: string,
  purpose: TokenPurpose,
): Promise<string> {
  const encoded = utf8ToB64url(JSON.stringify({ ...payload, purpose }));
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, purpose, 'sign'),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${bytesToB64url(new Uint8Array(sig))}`;
}

/**
 * Verifica assinatura + expiração. Usa `crypto.subtle.verify`, que já é
 * constant-time — não há comparação de string a proteger aqui.
 */
export async function verifyToken(
  token: string,
  secret: string,
  purpose: TokenPurpose,
): Promise<boolean> {
  return (await readToken(token, secret, purpose)) !== null;
}

/** Como `verifyToken`, mas devolve o payload (para o e-mail de auditoria). null se inválido. */
export async function readToken(
  token: string,
  secret: string,
  purpose: TokenPurpose,
): Promise<SessionPayload | null> {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, purpose, 'verify'),
      b64urlToBytes(sig) as unknown as ArrayBuffer,
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(encoded))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    // Cinto e suspensório: a subchave HKDF já torna o token de outro propósito inverificável,
    // então chegar aqui com `purpose` divergente só acontece se alguém emitir com a subchave
    // certa e o campo errado. Recusar de todo jeito mantém as duas camadas concordando.
    if (payload.purpose !== undefined && payload.purpose !== purpose) return null;
    return payload;
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
