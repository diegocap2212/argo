// Pergunta de autorização AO VIVO, para quem tem o cookie do portal mas não tem o JWT.
//
//   GET /api/authz?perm=neo.nero.access
//   Cookie: neo_session
//   → 204 pode · 403 não pode · 401 sem sessão válida · 400 perm malformada
//     · 503 configuração ausente ou banco indisponível
//
// POR QUE ISTO EXISTE: o Nero é server-rendered (Next) e o browser nunca lhe entrega o JWT do
// Supabase — o que ele tem é o cookie HttpOnly do portal. Sem este endpoint, a única trava
// possível do lado dele seria uma senha compartilhada, que é o que esta rodada remove.
//
// POR QUE NÃO LER AS CLAIMS DO PRÓPRIO COOKIE: elas envelhecem até 12h. Este endpoint existe
// justamente para a REVOGAÇÃO valer sem esperar cookie novo — quem perdeu o papel perde o
// acesso na próxima navegação. Ler a claim aqui devolveria a resposta rápida e errada.
//
// O QUE ESTE ENDPOINT NÃO É: um oráculo de permissões de terceiros. Ele só responde sobre o
// dono do cookie apresentado, e forjar o cookie exige o SESSION_SECRET.
//
// ⚠️ AUTOCONTIDO POR IMPOSIÇÃO DA PLATAFORMA — NÃO IMPORTE @neo/auth AQUI.
// As functions da Vercel não resolvem código compartilhado (ERR_MODULE_NOT_FOUND em runtime,
// medido em 2026-07-26 — ver o cabeçalho de api/session.ts). Esta é a QUARTA cópia do HMAC, e
// como as outras três ela é guardada por packages/neo-auth/test.ts. Mexeu aqui? Rode:
//   pnpm --filter @neo/auth test
import crypto from 'crypto';

/** Tem de bater EXATAMENTE com @neo/auth, middleware.ts, api/session.ts e api/gate.ts. */
const HKDF_SALT = 'neo-portal/token-subkey/v1';

/** Aqui só vale o cookie de SESSÃO — nunca o da Torre nem o do Nero. */
const PURPOSE = 'neo_session';

function subkey(secret: string, purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', secret, HKDF_SALT, purpose, 32));
}

export function parseCookie(header: string | undefined, name: string): string | null {
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

/**
 * Verifica o cookie e devolve o e-mail de dentro dele, ou null. Devolver o e-mail (e não só
 * um booleano) é o ponto: é ele o sujeito da pergunta feita ao banco.
 */
export function emailFromSession(token: string, secret: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(
    crypto.createHmac('sha256', subkey(secret, PURPOSE)).update(payload).digest('base64url'),
  );
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null;
    if (parsed.purpose !== undefined && parsed.purpose !== PURPOSE) return null;
    return typeof parsed.email === 'string' && parsed.email ? parsed.email : null;
  } catch {
    return null;
  }
}

/**
 * Forma de um id de permissão: `app.grupo.acao`. Recusar o que não tem esta forma evita que o
 * endpoint vire eco de string arbitrária no log e mantém a resposta previsível — uma permissão
 * inexistente com forma válida simplesmente não estará na lista, e o resultado é 403.
 */
export function isPermId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$/.test(value);
}

interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | string[] | undefined>;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

/**
 * Permissões GLOBAIS do e-mail, perguntadas ao Supabase com o segredo do Vault.
 *
 * Nunca com `service_role`: era esse o P0 do `sync-anchors` no review de 2026-07-27. A função
 * `neo_perms_for_email` é `security definer` e devolve `{}` sem o segredo certo — ver
 * 20260731130000_neo_authz_rpc.sql.
 *
 * Devolve null para "não sei" (rede, RPC fora do ar), que o handler traduz em 503. Distinguir
 * "não sei" de "não pode" importa: um 403 por indisponibilidade mandaria a pessoa procurar o
 * administrador por um problema que não é de permissão.
 */
async function permsFor(email: string): Promise<string[] | null> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.NEO_AUTHZ_SECRET;
  if (!url || !anon || !secret) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/neo_perms_for_email`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_secret: secret }),
    });
    if (!r.ok) return null;
    const body = await r.json().catch(() => null);
    return Array.isArray(body) && body.every((x) => typeof x === 'string') ? (body as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * Há configuração suficiente para DECIDIR? Sem ela a resposta é 503, em todo ambiente.
 *
 * ⚠️ AQUI A REGRA É MAIS DURA QUE A DO RESTO DO PORTAL, DE PROPÓSITO. `middleware.ts`,
 * `api/gate.ts` e `isNeoAuthed` abrem em preview quando a env falta e só fecham em produção —
 * comportamento que a revisão de 2026-07-31 registrou como fail-open (achado NEO-004). Não vou
 * replicar isso num endpoint cuja única função é autorizar: um preview sem env liberaria o
 * Nero inteiro. A saída para o desenvolvimento local é explícita e IMPOSSÍVEL na Vercel
 * (`process.env.VERCEL` está definida em todo deployment, inclusive preview).
 */
export function devBypassEnabled(env: Record<string, string | undefined>): boolean {
  return !env.VERCEL && env.NEO_AUTHZ_DEV_ALLOW === '1';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não suportado' });
    return;
  }

  const raw = Array.isArray(req.query?.perm) ? req.query?.perm[0] : req.query?.perm;
  if (!isPermId(raw)) {
    res.status(400).json({ error: 'Parâmetro perm ausente ou malformado' });
    return;
  }

  if (devBypassEnabled(process.env)) {
    res.status(204).end();
    return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Autorização indisponível (configuração ausente)' });
    return;
  }

  const cookie = parseCookie(req.headers?.cookie, 'neo_session');
  const email = cookie ? emailFromSession(cookie, secret) : null;
  if (!email) {
    res.status(401).json({ error: 'Sem sessão do NEO' });
    return;
  }

  const perms = await permsFor(email);
  if (perms === null) {
    // Fail-closed com o código honesto: 503 diz "não consegui decidir", e o Nero fecha.
    res.status(503).json({ error: 'Autorização indisponível' });
    return;
  }

  if (!perms.includes(raw)) {
    res.status(403).json({ error: 'Sem permissão' });
    return;
  }

  res.status(204).end();
}
