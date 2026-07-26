// Trava adicional por senha para superfícies restritas do Portal NEO. Substitui o antigo
// api/tower.ts, agora parametrizado por escopo:
//
//   GET  /api/gate?scope=tower  → 204 se o cookie neo_tower é válido, 401 se não
//   POST /api/gate?scope=tower  → valida identidade NEO + TOWER_PASSWORD → cookie 12h
//   GET  /api/gate?scope=nero   → idem com neo_nero
//   POST /api/gate?scope=nero   → idem com NERO_PASSWORD
//
// A senha nunca vai para o bundle: vive só na env e é comparada aqui.
//
// IDENTIDADE NEO — aceita as DUAS provas, porque os dois consumidores são diferentes:
//   - `Authorization: Bearer <jwt>`  → a Torre é chamada pelo SPA do Dash, que tem o JWT
//     do Supabase no localStorage.
//   - cookie `neo_session`          → o Nero é server-rendered (Next) e NÃO tem JWT no
//     browser; o que ele tem é o cookie HttpOnly emitido por /api/session.
// Nos dois casos a allowlist do NEO já foi aplicada (o RPC is_neo_allowed no Bearer; e o
// neo_session só é emitido depois desse mesmo RPC passar).
//
// ⚠️ AUTOCONTIDO POR IMPOSIÇÃO DA PLATAFORMA — NÃO IMPORTE @neo/auth AQUI.
// As functions da Vercel não resolvem código compartilhado (ERR_MODULE_NOT_FOUND em
// runtime, medido em 2026-07-26 — ver o cabeçalho de api/session.ts). A duplicação é
// guardada por packages/neo-auth/test.ts, que importa os helpers exportados abaixo.
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const TTL_SECONDS = 12 * 60 * 60;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/** Escopos válidos → env da senha + nome do cookie. Adicionar um escopo é adicionar uma linha. */
const SCOPES = {
  tower: { passwordEnv: 'TOWER_PASSWORD', cookie: 'neo_tower' },
  nero: { passwordEnv: 'NERO_PASSWORD', cookie: 'neo_nero' },
} as const;

export type Scope = keyof typeof SCOPES;

export function isScope(value: unknown): value is Scope {
  return value === 'tower' || value === 'nero';
}

// ── Sessão (inline; ver o aviso acima) ──
function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function verifyToken(token: string, secret: string): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

/** Payload do token já verificado — usado só para o e-mail de auditoria. */
function payloadOf(token: string): { email?: string } | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  } catch {
    return null;
  }
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      // Cookie malformado (ex.: `neo_nero=%`) não deve derrubar a função com 500.
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Hashes both values first so timingSafeEqual always compares the same byte length. */
export function safeSecretEqual(attempt: string, expected: string): boolean {
  const attemptHash = crypto.createHash('sha256').update(attempt).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(attemptHash, expectedHash);
}

interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

function redisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function rateLimitKey(req: ApiRequest, scope: Scope, secret: string): string {
  const forwarded = (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const ip = req.headers?.['x-real-ip'] || forwarded || 'unknown';
  const subject = crypto.createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 32);
  // Chave por ESCOPO: errar a senha da Torre não deve consumir tentativas do Nero.
  return `neo:gate:${scope}:attempts:${subject}`;
}

async function consumeAttempt(
  req: ApiRequest,
  scope: Scope,
  secret: string,
): Promise<{ allowed: boolean; key: string }> {
  const redis = redisClient();
  if (!redis) throw new Error('Rate limit do gate não configurado');
  const key = rateLimitKey(req, scope, secret);
  const attempts = await redis.incr(key);
  // EXPIRE em toda tentativa: se o INCR criasse a chave mas o EXPIRE falhasse (duas
  // operações separadas), a chave ficaria SEM TTL e travaria o IP para sempre. Renovar
  // a janela a cada tentativa é aceitável para força-bruta e garante que a chave expira.
  await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  return { allowed: attempts <= RATE_LIMIT_MAX, key };
}

/** Extrai o e-mail do payload do JWT só para log de auditoria — é decodificação, não verificação. */
function decodeJwtEmail(token: string): string | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const b64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const email = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))?.email;
    return typeof email === 'string' ? email : null;
  } catch {
    return null;
  }
}

// Autentica (JWT do Supabase) + autoriza (allowlist NEO) — mesmo padrão de api/data.ts.
async function verifyBearer(req: ApiRequest): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const auth = req?.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
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
 * Prova de identidade NEO por Bearer OU por cookie neo_session. Devolve o e-mail (ou
 * string vazia) quando aprovado, e null quando reprovado — assim o chamador não confunde
 * "aprovado sem e-mail" com "reprovado".
 */
async function verifyNeoIdentity(req: ApiRequest, secret: string): Promise<string | null> {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) {
    if (!(await verifyBearer(req))) return null;
    return decodeJwtEmail(auth.slice(7)) ?? '';
  }
  const session = parseCookie(req.headers?.cookie, 'neo_session');
  if (session && verifyToken(session, secret)) {
    return payloadOf(session)?.email ?? '';
  }
  return null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const rawScope = Array.isArray(req.query?.scope) ? req.query?.scope[0] : req.query?.scope;
  if (!isScope(rawScope)) {
    res.status(400).json({ error: 'Escopo inválido. Use ?scope=tower ou ?scope=nero.' });
    return;
  }
  const scope: Scope = rawScope;
  const { passwordEnv, cookie } = SCOPES[scope];

  const password = process.env[passwordEnv];
  const secret = process.env.SESSION_SECRET;
  const prod = process.env.VERCEL_ENV === 'production';

  if (req.method === 'GET') {
    // Trava não configurada: aberto em dev/preview; em produção fecha (fail-closed).
    if (!password || !secret) {
      if (prod) {
        res.status(503).json({ error: `Gate "${scope}" não configurado` });
        return;
      }
      res.status(204).end();
      return;
    }
    const token = parseCookie(req.headers?.cookie, cookie);
    if (token && verifyToken(token, secret)) {
      res.status(204).end();
      return;
    }
    res.status(401).json({ error: 'Senha necessária' });
    return;
  }

  if (req.method === 'POST') {
    if (!password || !secret) {
      if (prod) {
        res.status(503).json({ error: `Gate "${scope}" não configurado` });
        return;
      }
      res.status(204).end();
      return;
    }

    const email = await verifyNeoIdentity(req, secret);
    if (email === null) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    const attempt =
      typeof (req.body as { password?: unknown })?.password === 'string'
        ? (req.body as { password: string }).password
        : '';

    let limit: { allowed: boolean; key: string };
    try {
      limit = await consumeAttempt(req, scope, secret);
    } catch {
      res.status(503).json({ error: 'Proteção contra tentativas indisponível' });
      return;
    }
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_SECONDS));
      res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
      return;
    }

    if (!safeSecretEqual(attempt, password)) {
      res.status(403).json({ error: 'Senha incorreta' });
      return;
    }
    await redisClient()?.del(limit.key).catch(() => undefined);

    // Log de auditoria: quem abriu a superfície restrita (SECURITY-PLAN §6). Vai para os
    // logs da Vercel, nunca para uma resposta HTTP — não expõe nada a quem chama a API.
    console.log(
      `[gate:${scope}] acesso concedido: ${email || 'e-mail desconhecido'} em ${new Date().toISOString()}`,
    );

    const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + TTL_SECONDS * 1000 })).toString(
      'base64url',
    );
    res.setHeader(
      'Set-Cookie',
      `${cookie}=${payload}.${sign(payload, secret)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`,
    );
    res.status(204).end();
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Método não suportado' });
}
