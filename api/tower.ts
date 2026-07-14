// Trava da visão "Torre" (comparativo entre agilistas) do Performance Dash.
// A senha vive na env TOWER_PASSWORD e é validada aqui (nunca no bundle). Ao acertar,
// emite o cookie neo_tower (HMAC, mesmo padrão do neo_session) que o GET verifica.
// GET: 204 se o cookie é válido (ou se a trava não está configurada — dev), 401 caso contrário.
// POST {password}: valida Bearer + senha → cookie por 12h.
import crypto from 'crypto';

const COOKIE = 'neo_tower';
const TTL_SECONDS = 12 * 60 * 60;

// ── Sessão (inline; a Vercel não empacota imports relativos entre functions) ──
function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
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
  const password = process.env.TOWER_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (req.method === 'GET') {
    // Trava não configurada (dev local): aberto — paridade com os demais gates.
    if (!password || !secret) {
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
    const a = Buffer.from(attempt);
    const b = Buffer.from(password);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'Senha incorreta' });
      return;
    }
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
