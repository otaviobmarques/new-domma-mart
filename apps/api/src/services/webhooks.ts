import { type WebhookEvent, nextWebhookAttempt } from "@domma/core";
import { signWebhook } from "@domma/core/server";
import { type Tx, withContext } from "@domma/db";
import type { Deps } from "../lib/deps.ts";

/** Registra o evento para cada endereço cadastrado da conta. A entrega é feita pela fila. */
export async function emitEvent(tx: Tx, accountId: string, event: WebhookEvent, data: Record<string, unknown>) {
  await tx`
    insert into webhook_deliveries (account_id, endpoint_id, event, payload)
    select ${accountId}, e.id, ${event}, ${tx.json({ event, created_at: new Date().toISOString(), data } as never)}
    from webhook_endpoints e
    where e.account_id = ${accountId} and e.active and (cardinality(e.events) = 0 or ${event} = any(e.events))`;
}

/** Entrega os webhooks pendentes: assinados, com reenvio crescente por até 72 horas. */
export async function deliverDueWebhooks(deps: Deps, limit = 20): Promise<number> {
  const { sql } = deps;
  const batch = await withContext(sql, { kind: "system" }, (tx) => tx`
    update webhook_deliveries d set attempts = d.attempts + 1, next_attempt_at = now() + interval '5 minutes'
    from webhook_endpoints e
    where e.id = d.endpoint_id and d.id in (
      select id from webhook_deliveries where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at limit ${limit} for update skip locked)
    returning d.id, d.event, d.payload, d.attempts, e.url, e.secret`);
  await Promise.all(
    batch.map(async (d) => {
      const body = JSON.stringify({ id: d.id, ...d.payload });
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const res = await fetch(d.url, {
          method: "POST",
          headers: { "content-type": "application/json", "domma-signature": signWebhook(body, d.secret), "domma-event": d.event, "user-agent": "DommaMart-Webhooks/1" },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        if (!res.ok) error = `O endereço respondeu ${res.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const next = error ? nextWebhookAttempt(d.attempts, deps.now()) : null;
      await withContext(sql, { kind: "system" }, (tx) =>
        error
          ? tx`update webhook_deliveries set last_status_code = ${statusCode}, last_error = ${error},
                 status = ${next ? "pending" : "failed"}, next_attempt_at = ${next} where id = ${d.id}`
          : tx`update webhook_deliveries set status = 'delivered', delivered_at = now(), last_status_code = ${statusCode},
                 last_error = null, next_attempt_at = null where id = ${d.id}`,
      );
    }),
  );
  return batch.length;
}

/** Em produção só aceitamos HTTPS e nunca endereços internos. */
export function validateWebhookUrl(raw: string, production: boolean): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Endereço inválido.";
  }
  if (url.protocol !== "https:" && (production || url.protocol !== "http:")) return "O endereço precisa começar com https://";
  if (production) {
    const host = url.hostname;
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^(\d+\.){3}\d+$/.test(host) || host.includes(":"))
      return "Use um endereço público (domínio), não um IP ou endereço interno.";
  }
  return null;
}
