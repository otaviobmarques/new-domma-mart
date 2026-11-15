import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError, SESSION_COOKIE, api } from "./api";

export interface Me {
  user: { id: string; name: string; email: string; is_backoffice: boolean };
  accounts: { id: string; name: string; role: string; kyc_status: string; status: string }[];
  current_account_id: string | null;
  restricted: boolean;
}

export const getMe = cache(async (): Promise<Me | null> => {
  if (!(await cookies()).get(SESSION_COOKIE)) return null;
  try {
    return await api<Me>("/v1/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
});

export async function requireMe(next: string): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return me;
}
