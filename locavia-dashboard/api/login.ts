import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// Rate-limit de login (anti brute-force). Usa o mesmo KV do resto do app.
// Se o KV não estiver configurado, o limite é ignorado (não quebra dev/local).
const redis = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
  : null;
const RL_MAX = 8;             // tentativas falhas
const RL_WINDOW = 15 * 60;    // por 15 min

// Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node).
interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

function clientIp(req: ApiRequest): string {
  const xf = req.headers?.['x-forwarded-for'] || '';
  return xf.split(',')[0].trim() || req.headers?.['x-real-ip'] || 'unknown';
}

/**
 * Gate de login por senha única.
 *   GET    /api/login → { authenticated, configured }
 *   POST   /api/login { password } → seta cookie de sessão (HttpOnly) se a senha bate
 *   DELETE /api/login → logout (limpa o cookie)
 *
 * A senha vive só no servidor (env DASHBOARD_PASSWORD); a comparação é timing-safe.
 * Sessão = token assinado por HMAC (env SESSION_SECRET) em cookie HttpOnly (12h).
 *
 * NB: lógica de sessão é inline (sem import relativo entre functions — a Vercel não
 * empacota ./_session e dá ERR_MODULE_NOT_FOUND em runtime).
 */

const SESSION_COOKIE = 'dash_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

function sessionConfigured(): boolean {
  return !!process.env.SESSION_SECRET && !!process.env.DASHBOARD_PASSWORD;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function makeToken(secret: string): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function verifyToken(token: string, secret: string): boolean {
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

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookieHeader(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${maxAge}`;
}

function isAuthed(req: ApiRequest): boolean {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret || !process.env.DASHBOARD_PASSWORD) return true;
  const token = parseCookie(req?.headers?.cookie, SESSION_COOKIE);
  return !!token && verifyToken(token, secret);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthed(req), configured: sessionConfigured() });
  }

  if (req.method === 'POST') {
    if (!sessionConfigured()) {
      return res.status(503).json({ error: 'Login não configurado (faltam SESSION_SECRET/DASHBOARD_PASSWORD).' });
    }
    const secret = process.env.SESSION_SECRET as string;
    const expected = process.env.DASHBOARD_PASSWORD as string;
    const body = req.body || {};
    const provided = typeof body.password === 'string' ? body.password : '';

    // Rate-limit por IP (best-effort): bloqueia após RL_MAX falhas na janela.
    const rlKey = `login_attempts:${clientIp(req)}`;
    if (redis) {
      try {
        const attempts = Number((await redis.get(rlKey)) || 0);
        if (attempts >= RL_MAX) {
          return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
        }
      } catch { /* KV indisponível: não bloqueia o login */ }
    }

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!valid) {
      if (redis) {
        try {
          const n = await redis.incr(rlKey);
          if (n === 1) await redis.expire(rlKey, RL_WINDOW);
        } catch { /* ignore */ }
      }
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    if (redis) { try { await redis.del(rlKey); } catch { /* ignore */ } }
    res.setHeader('Set-Cookie', cookieHeader(makeToken(secret), MAX_AGE_SECONDS));
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
