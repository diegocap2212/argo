import { NextResponse } from "next/server";
import { SESSION_COOKIE, makeSessionToken, checkPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");

  if (!checkPassword(password)) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }

  const token = await makeSessionToken();
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}
