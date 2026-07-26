// Emite/remove o cookie de sessão do Portal NEO (neo_session), consumido pelo middleware
// que protege /dash/**, /maturity/** e /nero/** (HTML e assets) na borda.
// POST: valida o Bearer do Supabase + allowlist (RPC is_neo_allowed) e grava o cookie HMAC.
// DELETE: expira o cookie (logout).
//
// A criptografia e o formato do token vivem em @neo/auth — não reimplementar aqui.
import {
  type ApiRequest,
  type ApiResponse,
  bearerFrom,
  emailFromJwt,
  serializeCookie,
  signToken,
  verifyBearer,
} from '../packages/neo-auth/src/index.ts';

const COOKIE = 'neo_session';
const TTL_SECONDS = 12 * 60 * 60; // 12h; o hub re-emite a cada visita autenticada.

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'SESSION_SECRET não configurado' });
      return;
    }
    if (!(await verifyBearer(req.headers?.authorization))) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    // E-mail vai no payload para auditoria/depuração — o JWT já foi validado pelo RPC.
    const email = emailFromJwt(bearerFrom(req.headers?.authorization)) ?? '';
    const token = await signToken({ email, exp: Date.now() + TTL_SECONDS * 1000 }, secret);
    res.setHeader('Set-Cookie', serializeCookie(COOKIE, token, TTL_SECONDS));
    res.status(204).end();
    return;
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', serializeCookie(COOKIE, '', 0));
    res.status(204).end();
    return;
  }

  res.setHeader('Allow', 'POST, DELETE');
  res.status(405).json({ error: 'Método não suportado' });
}
