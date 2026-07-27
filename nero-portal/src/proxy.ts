import { NextRequest, NextResponse } from "next/server";
import { parseCookie, readToken, verifyToken } from "@neo/auth";
import { BASE_PATH } from "@/lib/base-path";
import { ACTOR_EMAIL_HEADER } from "@/lib/state/actor";

/**
 * Gate do Nero (no Next 16 o "middleware" chama-se "proxy").
 *
 * DUAS travas, porque o Nero contém informação proprietária e por isso é mais restrito que
 * o Dash e o Maturity:
 *   1. `neo_session` — a sessão do Portal NEO (login OTP + allowlist), emitida por
 *      /api/session no hub. É a MESMA trava das outras duas ferramentas.
 *   2. `neo_nero`    — a senha específica do Nero, emitida por /api/gate?scope=nero.
 *
 * A tela /login exige só a (1): é onde o usuário digita a senha para obter a (2).
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
const GATE_COOKIE = "neo_nero";

/** Volta ao hub do NEO preservando o destino, igual ao middleware do portal faz. */
function toHub(req: NextRequest): NextResponse {
  const origin = process.env.NEO_ORIGIN || "https://neo-lm.vercel.app";
  const next = encodeURIComponent(`${BASE_PATH}${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(`${origin}/?next=${next}`);
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

  // A tela de senha é o único lugar que dispensa a trava (2) — é onde ela é obtida.
  if (pathname === "/login") return passthroughWithActor();

  // (2) Senha do Nero.
  const gate = parseCookie(cookies, GATE_COOKIE);
  if (!gate || !(await verifyToken(gate, secret, "nero"))) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Acesso ao Nero requer senha.", { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return passthroughWithActor();
}
