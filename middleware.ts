// Edge Middleware do Portal NEO: barra /dash/**, /maturity/**, /nero/** e /admin/** (HTML e
// assets) sem o cookie neo_session emitido por /api/session após o login no hub. Roda na
// borda, antes do filesystem. /api/** fica fora do matcher (as functions validam por conta).
//
// PRÉ-FILTRO, NÃO AUTORIZAÇÃO. Desde o RBAC ele também confere a PERMISSÃO da porta, lida das
// claims do cookie — mas isso decide apenas se a porta APARECE. A claim envelhece (até 12h) e
// esta camada nunca é a última: atrás de cada porta há verificação ao vivo (RLS com o JWT no
// MMA e no admin, `has_perm` no /api/data do Dash, /api/authz no Nero). Recusa aqui não é
// "acesso negado" — é "vá ao hub", que tem o dado fresco e dá a palavra final.
//
// ⚠️ ESTE ARQUIVO É AUTOCONTIDO POR IMPOSIÇÃO DA PLATAFORMA — NÃO ADICIONE IMPORTS.
// O Edge Middleware standalone da Vercel (middleware.ts na raiz de um projeto não-Next) não
// bundleia dependências: tanto `import ... from '@neo/auth'` quanto o caminho relativo
// `./packages/neo-auth/src/index.ts` fazem o deploy FALHAR com
//   "The Edge Function 'middleware' is referencing unsupported modules".
// Testado nos dois formatos em 2026-07-26. Por isso o HMAC está duplicado aqui em vez de
// vir de @neo/auth como nas functions e no Nero.
//
// A duplicação é INTENCIONAL mas não é livre: `packages/neo-auth/test.ts` tem uma seção de
// CONTRATO que importa estas funções e exige que elas concordem com o pacote token por
// token. Se alguém mudar um lado só, o teste quebra. Mexeu aqui? Rode:
//   pnpm --filter @neo/auth test

export const config = {
  matcher: ['/dash/:path*', '/maturity/:path*', '/nero/:path*', '/admin/:path*'],
};

const COOKIE = 'neo_session';

/**
 * CÓPIA do mapa de portas de `packages/neo-auth` (`PORTAL_DOORS`). O Edge Middleware não
 * bundleia imports, então a duplicação é imposta — e `packages/neo-auth/test.ts` compara as
 * duas linha a linha. Divergir aqui faz a borda proteger uma rota com a permissão errada, o
 * que é indistinguível de "protegida" até alguém tentar entrar.
 */
export const DOORS: ReadonlyArray<{ prefix: string; perm: string }> = [
  { prefix: '/dash', perm: 'neo.dash.access' },
  { prefix: '/maturity', perm: 'neo.mma.access' },
  { prefix: '/nero', perm: 'neo.nero.access' },
  { prefix: '/admin', perm: 'neo.admin.access' },
];

export function doorForPath(pathname: string): { prefix: string; perm: string } | null {
  for (const door of DOORS) {
    if (pathname === door.prefix || pathname.startsWith(`${door.prefix}/`)) return door;
  }
  return null;
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      // Cookie malformado (ex.: `neo_session=%`) não deve virar 500 no Edge.
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Salt do HKDF — tem de bater EXATAMENTE com @neo/auth, api/session.ts e api/gate.ts.
 * O teste de contrato (`pnpm --filter @neo/auth test`) falha se divergir.
 */
const HKDF_SALT = 'neo-portal/token-subkey/v1';

/** Este middleware só valida o cookie de SESSÃO — nunca o da Torre nem o do Nero. */
const PURPOSE = 'neo_session';

/**
 * Subchave HMAC por propósito (HKDF-SHA256). Os três cookies do portal eram assinados com o
 * MESMO segredo e este verificador olhava só assinatura + `exp` — então o cookie da Torre
 * abria `/dash` e `/maturity` como se fosse sessão. Agora a assinatura de outro propósito nem
 * confere: foi feita com outra chave.
 */
async function purposeKey(secret: string, purpose: string): Promise<CryptoKey> {
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
  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
}

/** O que a borda lê do payload. `perms` ausente ≠ vazio — ver o aviso em @neo/auth. */
export interface EdgePayload {
  email?: string;
  exp: number;
  purpose?: string;
  perms?: string[];
}

/**
 * Verifica assinatura + expiração e DEVOLVE o payload (null se inválido). A borda precisa do
 * conteúdo, não só do veredito: é de `perms` que sai a decisão de porta.
 */
export async function readPayload(token: string, secret: string): Promise<EdgePayload | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const key = await purposeKey(secret, PURPOSE);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig) as unknown as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as EdgePayload;
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null;
    if (parsed.purpose !== undefined && parsed.purpose !== PURPOSE) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Verifica `payload.assinatura` (HMAC-SHA256 base64url — mesmo formato de @neo/auth) + exp. */
export async function verifyToken(token: string, secret: string): Promise<boolean> {
  return (await readPayload(token, secret)) !== null;
}

/**
 * A DECISÃO DA BORDA, isolada da requisição para poder ser testada sem servidor.
 *
 *   'passa'      → segue para o filesystem
 *   'sem-sessao' → não há cookie válido: hub para autenticar
 *   'sem-claims' → cookie válido de ANTES do RBAC (ou emitido sem claims): hub para re-emitir.
 *                  É a autocura. Negar aqui derrubaria toda sessão viva no deploy.
 *   'sem-perm'   → claims assadas e a permissão não está lá. AINDA ASSIM vai ao hub, não a um
 *                  403: a claim pode estar velha para o outro lado (a pessoa acabou de ganhar
 *                  o papel). Quem tem o dado fresco é o hub, e é lá que a mensagem final é
 *                  dada — com trava de repetição, senão isto vira ping-pong.
 */
export type EdgeDecision = 'passa' | 'sem-sessao' | 'sem-claims' | 'sem-perm';

export function decide(payload: EdgePayload | null, perm: string | null): EdgeDecision {
  if (!payload) return 'sem-sessao';
  // Rota fora do mapa de portas: o matcher não deveria trazê-la, mas se trouxer, ter sessão
  // válida basta — inventar uma permissão aqui trancaria uma rota nova em silêncio.
  if (!perm) return 'passa';
  if (!Array.isArray(payload.perms)) return 'sem-claims';
  return payload.perms.includes(perm) ? 'passa' : 'sem-perm';
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  // Sem SESSION_SECRET: em dev/preview abre (paridade com o gate das functions);
  // em PRODUÇÃO é misconfiguração e o gate fecha (fail-closed) — nunca libera as apps
  // por env sumida. Ver HANDOFF.
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV === 'production') {
      return new Response('Serviço temporariamente indisponível (configuração ausente).', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return undefined;
  }

  const url = new URL(request.url);
  const door = doorForPath(url.pathname);
  const token = parseCookie(request.headers.get('cookie'), COOKIE);
  const payload = token ? await readPayload(token, secret) : null;

  const decision = decide(payload, door?.perm ?? null);
  if (decision === 'passa') return undefined;

  // Volta ao hub preservando o destino. Response construída na mão: Response.redirect() tem
  // headers imutáveis e o `headers.set` posterior lançaria TypeError no runtime Edge.
  //
  // `negado` viaja junto quando a recusa foi por PERMISSÃO (e não por falta de sessão ou de
  // claims): é o que permite ao hub dizer qual porta foi negada sem ter de refazer o
  // mapeamento — e é o sinal de que ele deve parar o ping-pong se a segunda tentativa também
  // falhar. Sem ele o hub não distingue "acabou de logar" de "voltou negado".
  const next = encodeURIComponent(url.pathname + url.search);
  const negado = decision === 'sem-perm' && door ? `&negado=${encodeURIComponent(door.perm)}` : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/?next=${next}${negado}`, request.url).toString(),
      'Cache-Control': 'no-store',
    },
  });
}
