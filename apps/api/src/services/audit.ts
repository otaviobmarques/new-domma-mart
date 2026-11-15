import type { Tx } from "@domma/db";
import type { Auth } from "../lib/router.ts";

/** Trilha de auditoria imutável para ações financeiras e administrativas. */
export async function audit(
  tx: Tx,
  input: { auth?: Auth | null; actorKind?: "user" | "api_key" | "backoffice" | "system" | "ai"; accountId?: string | null; action: string; target?: string; data?: Record<string, unknown> },
) {
  const auth = input.auth;
  const actorKind = input.actorKind ?? (auth?.kind === "api_key" ? "api_key" : auth?.kind === "session" ? "user" : "system");
  const actorUserId = auth?.kind === "session" ? auth.user.id : null;
  const data = { ...(input.data ?? {}), ...(auth?.kind === "api_key" ? { api_key_id: auth.keyId } : {}) };
  await tx`
    insert into audit_log (actor_user_id, actor_kind, account_id, action, target, data)
    values (${actorUserId}, ${actorKind}, ${input.accountId ?? auth?.account?.id ?? null}, ${input.action}, ${input.target ?? null}, ${tx.json(data as never)})`;
}
