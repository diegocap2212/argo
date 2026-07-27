// Emite/remove o cookie de sessão do Portal NEO (neo_session), consumido pelo middleware
// que protege /dash/**, /maturity/** e /nero/** (HTML e assets) na borda.
// POST: valida o Bearer do Supabase + allowlist (RPC is_neo_allowed) e grava o cookie HMAC.
// DELETE: expira o cookie (logout).
//
// ⚠️ AUTOCONTIDO POR IMPOSIÇÃO DA PLATAFORMA — NÃO IMPORTE @neo/auth AQUI.
// As functions de api/ na Vercel não resolvem código compartilhado. Testados em deployment
// real (2026-07-26), os dois formatos morrem com ERR_MODULE_NOT_FOUND em RUNTIME (o build
// passa, o que engana):
//   import ... from '@neo/auth'                          → o builder copia o pacote e cria
//     um filePathMap, mas o `exports` do pacote aponta .ts e o emitido é .js
//   import ... from '../packages/neo-auth/src/index.ts'  → 500 FUNCTION_INVOCATION_FAILED
// É a mesma pegadinha que o HANDOFF registrou com `./_session`.
//
// A duplicação é INTENCIONAL mas guardada: packages/neo-auth/test.ts importa as funções
// exportadas abaixo e exige que concordem com o pacote. Mexeu aqui? Rode:
//   pnpm --filter @neo/auth test
import crypto from 'crypto';

const COOKIE = 'neo_session';
const TTL_SECONDS = 12 * 60 * 60; // 12h; o hub re-emite a cada visita autenticada.

// ── Sessão (inline; ver o aviso acima) ──

/**
 * Salt do HKDF — tem de bater EXATAMENTE com o de packages/neo-auth/src/index.ts e das outras
 * cópias autocontidas. O teste de contrato (`pnpm --filter @neo/auth test`) falha se divergir.
 */
const HKDF_SALT = 'neo-portal/token-subkey/v1';

/** Propósito deste token. Cada cookie tem o seu; ver o comentário em @neo/auth. */
const PURPOSE = 'neo_session';

/**
 * Subchave HMAC por propósito. Os três cookies do portal (`neo_session`, `neo_tower`,
 * `neo_nero`) eram assinados com o MESMO segredo, e os verificadores só olhavam assinatura +
 * `exp` — então qualquer token válido servia em qualquer trava. Com subchave derivada, um token
 * de outro propósito nem chega a verificar.
 */
function subkey(secret: string, purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', secret, HKDF_SALT, purpose, 32));
}

export function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', subkey(secret, PURPOSE)).update(payload).digest('base64url');
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
export async function verifyBearer(req: ApiRequest): Promise<boolean> {
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
export function emailFromJwt(bearer: string): string {
  try {
    const payload = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
    return typeof payload.email === 'string' ? payload.email : '';
  } catch {
    return '';
  }
}

/**
 * Monta o token `payload.assinatura` — mesmo formato de @neo/auth e do middleware.
 * `purpose` entra no payload junto: a subchave já garante o isolamento, e o campo deixa o
 * motivo legível em log quando um token aparece na trava errada.
 */
export function makeToken(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify({ ...payload, purpose: PURPOSE })).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
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
    const token = makeToken({ email, exp: Date.now() + TTL_SECONDS * 1000 }, secret);
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
