// Trava da visão "Torre" (comparativo entre agilistas) do Performance Dash.
// A senha vive na env TOWER_PASSWORD e é validada aqui (nunca no bundle). Ao acertar,
// emite o cookie neo_tower (HMAC, mesmo padrão do neo_session) que o GET verifica.
// GET: 204 se o cookie é válido (ou se a trava não está configurada — dev), 401 caso contrário.
// POST {password}: valida Bearer + senha → cookie por 12h.
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const COOKIE = 'neo_tower';
const TTL_SECONDS = 12 * 60 * 60;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

// ── Sessão (inline; a Vercel não empacota imports relativos entre functions) ──
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
export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      // Cookie malformado (ex.: `neo_tower=%`) não deve derrubar a função com 500.
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
// Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node).
interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
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

function rateLimitKey(req: ApiRequest, secret: string): string {
  const forwarded = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim();
  const ip = req.headers?.['x-real-ip'] || forwarded || 'unknown';
  const subject = crypto.createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 32);
  return `neo:tower:attempts:${subject}`;
}

async function consumeAttempt(req: ApiRequest, secret: string): Promise<{ allowed: boolean; key: string }> {
  const redis = redisClient();
  if (!redis) throw new Error('Rate limit da Torre não configurado');
  const key = rateLimitKey(req, secret);
  const attempts = await redis.incr(key);
  // EXPIRE em toda tentativa: se o INCR criasse a chave mas o EXPIRE falhasse (duas
  // operações separadas), a chave ficaria SEM TTL e travaria o IP para sempre. Renovar
  // a janela a cada tentativa é aceitável para força-bruta e garante que a chave expira.
  await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  return { allowed: attempts <= RATE_LIMIT_MAX, key };
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const password = process.env.TOWER_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  const prod = process.env.VERCEL_ENV === 'production';

  if (req.method === 'GET') {
    // Trava não configurada: aberto em dev/preview; em produção fecha (fail-closed).
    if (!password || !secret) {
      if (prod) {
        res.status(503).json({ error: 'Torre não configurada' });
        return;
      }
      res.status(204).end();
      return;
    }
    const token = parseCookie(req.headers?.cookie, COOKIE);
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
        res.status(503).json({ error: 'Torre não configurada' });
        return;
      }
      res.status(204).end();
      return;
    }
    if (!(await verifyBearer(req))) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    const attempt = typeof (req.body as { password?: unknown })?.password === 'string'
      ? ((req.body as { password: string }).password)
      : '';

    let limit: { allowed: boolean; key: string };
    try {
      limit = await consumeAttempt(req, secret);
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
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_SECONDS * 1000 })).toString('base64url');
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${payload}.${sign(payload, secret)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`,
    );
    res.status(204).end();
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Método não suportado' });
}
