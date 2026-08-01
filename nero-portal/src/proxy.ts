import { NextRequest, NextResponse } from "next/server";
import { parseCookie, readToken } from "@neo/auth";
import { BASE_PATH } from "@/lib/base-path";
import { ACTOR_EMAIL_HEADER } from "@/lib/state/actor";

/**
 * Gate do Nero (no Next 16 o "middleware" chama-se "proxy").
 *
 * DUAS travas, porque o Nero contém informação proprietária e por isso é mais restrito que
 * o Dash e o Maturity:
 *   1. `neo_session` — a sessão do Portal NEO (login OTP + allowlist), emitida por
 *      /api/session no hub. É a MESMA trava das outras duas ferramentas.
 *   2. `neo.nero.access` — a PERMISSÃO da pessoa, perguntada ao portal a cada navegação.
 *
 * A trava (2) era, até 31/07/2026, o cookie `neo_nero` obtido digitando a `NERO_PASSWORD`
 * compartilhada. Senha compartilhada não tem QUEM: não havia offboarding (sair da empresa não
 * tirava o acesso — só trocar a senha de todo mundo tirava) e nem como distinguir duas pessoas.
 *
 * O PREÇO DESTA ESCOLHA, EXPLÍCITO: o Nero passa a depender do portal em tempo de execução.
 * Portal lento = Nero lento; portal fora do ar = Nero FECHA (fail-closed, coerente com a regra
 * do repo). Isso é o custo da revogação imediata, e está escrito aqui para não virar surpresa
 * durante um incidente.
 *
 * A tela /login não pede mais senha: ela explica que o acesso não está liberado.
 *
 * DEFESA EM PROFUNDIDADE: o middleware do neo-lm já barra /nero/** na borda. Validar de
 * novo aqui é redundante DE PROPÓSITO — se o matcher de lá for mal configurado algum dia,
 * o app continua fechado. E o deployment do nero-portal também é alcançável pela URL
 * própria dele, onde o middleware do portal não roda; como os cookies são da origem do
 * portal e não viajam para cá, o acesso direto cai no redirect para o hub.
 *
 * Aqui `@neo/auth` FUNCIONA como import normal: é o Next que faz o bundle, não o builder de
 * Edge Middleware/functions da Vercel (que não resolve módulo compartilhado — ver o
 * cabeçalho de api/session.ts na raiz do monorepo).
 */
export const config = {
  // "/" É OBRIGATÓRIO E SEPARADO. O padrão `/((?!...).*)`  NÃO casa a rota índice — pegadinha
  // conhecida do matcher do Next. Sem esta entrada, `/nero/` servia a home do Nero a QUALQUER
  // usuário com sessão do portal, sem a senha: bypass do gate, encontrado em produção pelo
  // e2e em 2026-07-26 (as outras rotas, estáticas e dinâmicas, redirecionavam corretamente —
  // só o índice escapava). Não remover.
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};

const SESSION_COOKIE = "neo_session";
const NERO_PERM = "neo.nero.access";

/** Volta ao hub do NEO preservando o destino, igual ao middleware do portal faz. */
function toHub(req: NextRequest): NextResponse {
  const next = encodeURIComponent(`${BASE_PATH}${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(`${neoOrigin()}/?next=${next}`);
}

function neoOrigin(): string {
  return process.env.NEO_ORIGIN || "https://neo-lm.vercel.app";
}

/**
 * MEMO DE 60s, chaveado pela ASSINATURA do cookie.
 *
 * Sem ele, cada asset de uma página vira uma chamada HTTP ao portal — dezenas por navegação,
 * cada uma somando latência ao carregamento. 60s é o teto de quanto tempo uma revogação pode
 * demorar a valer aqui, e é o número que está documentado no HANDOFF: revogar papel fecha o
 * Nero em ≤60s, sem exigir novo login.
 *
 * A chave é a assinatura (a parte depois do ponto), não o e-mail: dois cookies com o mesmo
 * e-mail mas assinaturas diferentes são sessões diferentes, e um cookie expirado nem chega
 * aqui (o `readToken` acima já o recusou).
 *
 * `Map` em escopo de módulo vive por isolate e some quando ele recicla — é cache, não estado.
 * A poda por tamanho existe para o Map não crescer sem limite num isolate longevo.
 */
const authzMemo = new Map<string, { allowed: boolean; until: number }>();
const AUTHZ_TTL_MS = 60_000;
const AUTHZ_MEMO_MAX = 500;

async function podeEntrarNoNero(cookieHeader: string, signature: string): Promise<boolean> {
  const now = Date.now();
  const hit = authzMemo.get(signature);
  if (hit && hit.until > now) return hit.allowed;

  let allowed = false;
  try {
    const r = await fetch(`${neoOrigin()}/api/authz?perm=${NERO_PERM}`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    // 204 = pode. 403 = não pode. 401/503/qualquer outra = não decidiu → fecha.
    allowed = r.status === 204;
    // NÃO memoizar a indisponibilidade: guardar um "não" que veio de 503 manteria o Nero
    // fechado por 60s depois de o portal voltar. Erro se repergunta na próxima navegação.
    if (r.status !== 204 && r.status !== 403) return false;
  } catch {
    return false;
  }

  if (authzMemo.size >= AUTHZ_MEMO_MAX) authzMemo.clear();
  authzMemo.set(signature, { allowed, until: now + AUTHZ_TTL_MS });
  return allowed;
}

export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;

  // Sem SESSION_SECRET: em dev abre (paridade com o gate das outras ferramentas); em
  // PRODUÇÃO é misconfiguração e fecha (fail-closed) — env sumida nunca vira bypass.
  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      return new NextResponse("Serviço temporariamente indisponível (configuração ausente).", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  const cookies = req.headers.get("cookie");
  const { pathname } = req.nextUrl;

  // (1) Sessão do portal — sem ela, nem a tela de senha aparece.
  // `readToken` em vez de `verifyToken`: além de validar, devolve o payload com o e-mail.
  // Era o elo que faltava para a auditoria ter PESSOA, e não só tipo de ator (achado 7.4).
  const session = parseCookie(cookies, SESSION_COOKIE);
  const claims = session ? await readToken(session, secret, "neo_session") : null;
  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Não autenticado.", { status: 401 });
    }
    return toHub(req);
  }

  /**
   * Repassa a identidade validada para o app.
   *
   * Ordem importa: DELETE antes de SET. Sem o delete, um cliente poderia mandar
   * `x-neo-actor-email: chefe@lm...` e a trilha de auditoria registraria outra pessoa. O
   * header só vale porque este proxy o reescreve incondicionalmente, depois de conferir a
   * assinatura HMAC do cookie.
   */
  // Extraído fora do closure: o narrowing de `claims` não sobrevive dentro da função.
  const actorEmail = claims.email ?? null;
  function passthroughWithActor(): NextResponse {
    const h = new Headers(req.headers);
    h.delete(ACTOR_EMAIL_HEADER);
    if (actorEmail) h.set(ACTOR_EMAIL_HEADER, actorEmail);
    return NextResponse.next({ request: { headers: h } });
  }

  // A tela que explica a falta de acesso é o único lugar que dispensa a trava (2) — senão
  // ela mesma redirecionaria para si própria.
  if (pathname === "/login") return passthroughWithActor();

  // (2) Permissão da pessoa, perguntada AO VIVO ao portal (com memo de 60s).
  if (!session || !(await podeEntrarNoNero(cookies ?? "", session.split(".")[1] ?? session))) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Sem permissão de acesso ao Nero.", { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return passthroughWithActor();
}
