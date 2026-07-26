import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

/**
 * Gate de senha do portal (no Next 16 o "middleware" chama-se "proxy").
 * Exceções (via matcher): tela/rota de login, assets do Next e estáticos.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Não autenticado.", { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
