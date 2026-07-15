// Emite/remove o cookie de sessão do Portal NEO (neo_session), consumido pelo middleware
// que protege /dash/** e /maturity/** (HTML e assets) na borda.
// POST: valida o Bearer do Supabase + allowlist (RPC is_neo_allowed) e grava o cookie HMAC.
// DELETE: expira o cookie (logout).
import crypto from 'crypto';

const COOKIE = 'neo_session';
const TTL_SECONDS = 12 * 60 * 60; // 12h; o hub re-emite a cada visita autenticada.

// ── Sessão (inline; a Vercel não empacota imports relativos entre functions) ──
function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
// Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node).
interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

// Autentica (JWT do Supabase via Authorization: Bearer) E autoriza (allowlist do NEO) numa
// única chamada ao RPC is_neo_allowed — mesmo padrão de api/data.ts.
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

/** E-mail do JWT (já validado pelo RPC) — vai no payload do cookie para auditoria/depuração. */
function emailFromJwt(bearer: string): string {
  try {
    const payload = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
    return typeof payload.email === 'string' ? payload.email : '';
  } catch {
    return '';
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'SESSION_SECRET não configurado' });
      return;
    }
    if (!(await verifyBearer(req))) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    const auth = req.headers?.authorization || '';
    const email = emailFromJwt(auth.startsWith('Bearer ') ? auth.slice(7) : '');
    const payload = Buffer.from(
      JSON.stringify({ email, exp: Date.now() + TTL_SECONDS * 1000 }),
    ).toString('base64url');
    const token = `${payload}.${sign(payload, secret)}`;
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`,
    );
    res.status(204).end();
    return;
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    res.status(204).end();
    return;
  }

  res.setHeader('Allow', 'POST, DELETE');
  res.status(405).json({ error: 'Método não suportado' });
}
