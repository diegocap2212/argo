// Emite/remove o cookie de sessão do Portal NEO (neo_session), consumido pelo middleware
// que protege /dash/**, /maturity/** e /nero/** (HTML e assets) na borda.
// POST: valida o Bearer do Supabase + allowlist (RPC is_neo_allowed), busca as claims de
//       autorização (RPC my_neo_claims) e grava o cookie HMAC.
// DELETE: expira o cookie (logout).
//
// ESTE É O ÚNICO EMISSOR DAS CLAIMS. `roles`/`perms` entram no payload aqui e em lugar nenhum
// mais; toda a borda e os apps apenas LEEM. Elas são pré-filtro de navegação e envelhecem até
// o cookie ser re-emitido — o aviso longo está em `SessionPayload` de packages/neo-auth.
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

/**
 * Claims de autorização assadas no cookie. Ver o aviso em `SessionPayload` de @neo/auth:
 * ausente ≠ vazio, e isto é pré-filtro de navegação, não autorização.
 */
export interface NeoClaims {
  roles: string[];
  perms: string[];
}

/**
 * Lê a resposta do RPC `my_neo_claims()`. É `returns table (roles text[], perms text[])`, então
 * o PostgREST devolve um ARRAY de uma linha: `[{"roles":[…],"perms":[…]}]`.
 *
 * Separado do fetch para poder ser testado sem rede: resposta torta do banco não pode virar
 * exceção não tratada no login — o pior resultado aceitável aqui é sessão sem claims.
 */
export function parseClaims(body: unknown): NeoClaims | null {
  const row = Array.isArray(body) ? body[0] : body;
  if (!row || typeof row !== 'object') return null;
  const { roles, perms } = row as { roles?: unknown; perms?: unknown };
  const strings = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  const r = strings(roles);
  const p = strings(perms);
  // `perms` é o que a borda consulta; sem ele não há claim que valha a pena assar.
  if (p === null) return null;
  return { roles: r ?? [], perms: p };
}

/**
 * Pergunta ao Supabase os papéis e permissões GLOBAIS da pessoa, COMO A PESSOA (o Bearer dela).
 *
 * Nunca com `service_role`: consultar autorização com chave privilegiada foi exatamente o P0 do
 * `sync-anchors` no review de 2026-07-27. Aqui não é preciso — quem está logando tem JWT, e
 * `my_neo_claims()` é `security definer` com `grant execute` só para `authenticated`.
 *
 * Falha (rede, RPC inexistente antes da migration, resposta torta) devolve null e o login segue
 * SEM claims. Recusar a sessão faria a disponibilidade do Supabase virar pré-requisito para
 * entrar no portal — pior do que hoje, e desnecessário: sem claims a borda manda ao hub, que
 * re-emite (autocura), e todo dado atrás da porta continua verificado ao vivo.
 */
export async function fetchClaims(bearer: string): Promise<NeoClaims | null> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !bearer) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/my_neo_claims`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) return null;
    return parseClaims(await r.json().catch(() => null));
  } catch {
    return null;
  }
}

/**
 * Teto do valor do cookie. O RFC 6265 exige que o browser aceite ao menos 4096 bytes por cookie
 * (nome + valor + atributos); acima disso ele DESCARTA o Set-Cookie em silêncio.
 *
 * Por que isso importa agora: até o RBAC o payload tinha e-mail e `exp` (~150 bytes). Com as
 * claims ele cresce com o catálogo de permissões, que é editável por tela. Um catálogo grande o
 * bastante faria o browser jogar fora o cookie inteiro — e sem `neo_session` a pessoa não entra
 * em NADA, o que é estritamente pior do que entrar sem claims. Por isso o corte é nas claims,
 * não na sessão. 3.800 deixa folga para os atributos do cookie.
 */
export const MAX_COOKIE_VALUE_BYTES = 3800;

export function fitsInCookie(token: string): boolean {
  return `${COOKIE}=${token}`.length <= MAX_COOKIE_VALUE_BYTES;
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
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const email = emailFromJwt(bearer);
    const exp = Date.now() + TTL_SECONDS * 1000;

    // Claims de navegação. Este é o único ponto do portal que as assa — todo o resto LÊ.
    const claims = await fetchClaims(bearer);
    let token = makeToken(
      claims ? { email, exp, roles: claims.roles, perms: claims.perms } : { email, exp },
      secret,
    );
    if (claims && !fitsInCookie(token)) {
      // Ver MAX_COOKIE_VALUE_BYTES: cookie grande demais é DESCARTADO pelo browser, e sem
      // `neo_session` ninguém entra em lugar nenhum. Cai para sessão sem claims (a borda manda
      // ao hub, o hub decide) e grita no log, que é onde isto tem de aparecer — a alternativa
      // é um login que "funciona" e um portal que não abre.
      console.error(
        `[session] claims descartadas: cookie ficaria com ${`${COOKIE}=${token}`.length} bytes ` +
          `(teto ${MAX_COOKIE_VALUE_BYTES}), ${claims.perms.length} permissões para ${email || 'e-mail desconhecido'}`,
      );
      token = makeToken({ email, exp }, secret);
    }

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
