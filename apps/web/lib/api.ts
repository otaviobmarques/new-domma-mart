import "server-only";
import { cookies, headers } from "next/headers";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const SESSION_COOKIE = "dm_session";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Token explícito; por padrão usa a sessão do cookie. null = chamada sem login. */
  token?: string | null;
  idempotencyKey?: string;
}

/** O front é só um cliente da API pública: toda tela passa por aqui. */
export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const token = opts.token === undefined ? (await cookies()).get(SESSION_COOKIE)?.value : opts.token;
  const forwarded = (await headers()).get("x-forwarded-for");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "api_unreachable", "Não conseguimos falar com o servidor. Tente de novo em instantes.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Algo deu errado. Tente de novo.");
  return data as T;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

/** Para ações chamadas pelo navegador: devolve o erro como texto simples em vez de estourar. */
export async function attempt<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

export async function setSession(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
