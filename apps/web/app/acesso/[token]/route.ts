import { type NextRequest, NextResponse } from "next/server";
import { ApiError, SESSION_COOKIE, api } from "@/lib/api";

/** Links enviados por e-mail já entram direto (uso único). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = process.env.WEB_URL ?? request.nextUrl.origin;
  try {
    const result = await api<{ token: string; redirect_to: string }>("/v1/auth/magic", { method: "POST", body: { token }, token: null });
    const to = result.redirect_to.startsWith("/") && !result.redirect_to.startsWith("//") ? result.redirect_to : "/compras";
    const response = NextResponse.redirect(new URL(to, base));
    response.cookies.set(SESSION_COOKIE, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
    return response;
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.redirect(new URL("/entrar?link=vencido", base));
    throw err;
  }
}
