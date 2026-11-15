"use server";

import { redirect } from "next/navigation";
import { api, attempt, clearSession, setSession } from "@/lib/api";

const safeNext = (next: string | undefined, fallback: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);

export async function requestCode(identifier: string) {
  return attempt(() => api<{ dev_code?: string }>("/v1/auth/code", { method: "POST", body: { identifier }, token: null }));
}

export async function signup(fields: { name: string; email: string; phone: string; intent?: string }) {
  return attempt(() => api<{ identifier: string; dev_code?: string }>("/v1/auth/signup", { method: "POST", body: { ...fields, intent: fields.intent || undefined }, token: null }));
}

export async function verifyCode(identifier: string, code: string, next?: string) {
  const result = await attempt(() => api<{ token: string; has_account: boolean }>("/v1/auth/verify", { method: "POST", body: { identifier, code }, token: null }));
  if (!result.ok) return result;
  await setSession(result.token);
  redirect(safeNext(next, result.has_account ? "/painel" : "/compras"));
}

export async function logout() {
  await api("/v1/auth/logout", { method: "POST" }).catch(() => {});
  await clearSession();
  redirect("/entrar");
}
