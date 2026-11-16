import type { Tx } from "@domma/db";
import { withContext } from "@domma/db";
import type { Deps } from "../lib/deps.ts";
import { defaultSender } from "./email-sender.ts";
import { type EmailTemplate, renderEmail } from "./email-templates.ts";

export type { EmailTemplate };

/** Coloca a mensagem na fila dentro da mesma transação: se a operação falhar, nada é enviado. */
export async function enqueueEmail(tx: Tx, to: string, template: EmailTemplate, data: Record<string, unknown>) {
  await tx`insert into outbox_messages (channel, recipient, template, data) values ('email', ${to.trim().toLowerCase()}, ${template}, ${tx.json(data as never)})`;
}

const MAX_ATTEMPTS = 5;
/** Espera antes de cada nova tentativa: 1 min, 5 min, 30 min e 2 h. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000];
/** O código de acesso vale 10 minutos: depois disso não adianta mais enviar. */
const LOGIN_CODE_TTL_MS = 10 * 60_000;

/** Envia o que está na fila. Sem chave do Resend, a mensagem sai no log (desenvolvimento). */
export async function deliverOutbox(deps: Deps, limit = 20): Promise<number> {
  const { sql, config } = deps;
  const sender = deps.emailSender ?? defaultSender(config);
  const now = deps.now();
  const batch = await withContext(sql, { kind: "system" }, (tx) => tx`
    update outbox_messages set attempts = attempts + 1
    where id in (
      select id from outbox_messages where status = 'pending' and channel = 'email'
        -- O banco guarda microssegundos e o relógio da aplicação, milissegundos: a folga evita perder o que acabou de entrar.
        and next_attempt_at <= ${now}::timestamptz + interval '1 millisecond'
      order by next_attempt_at limit ${limit} for update skip locked)
    returning id, recipient, template, data, attempts, created_at`);
  for (const msg of batch) {
    const [blocked] = await withContext(sql, { kind: "system" }, (tx) => tx`select reason from email_suppressions where email = ${msg.recipient}`);
    if (blocked) {
      await withContext(sql, { kind: "system" }, (tx) => tx`update outbox_messages set status = 'suppressed', last_error = ${`Endereço bloqueado: ${blocked.reason}`}, data = data - 'code' - 'link' where id = ${msg.id}`);
      continue;
    }
    let result: Awaited<ReturnType<typeof sender.send>>;
    try {
      const email = renderEmail(msg.template, msg.data, config.webUrl);
      result = await sender.send({ id: msg.id, to: msg.recipient, template: msg.template, ...email });
    } catch (err) {
      result = { ok: false, retry: true, error: err instanceof Error ? err.message : String(err) };
    }
    if (result.ok) {
      const providerId = result.providerId;
      // Depois de enviado, o código e o link de acesso não ficam guardados.
      await withContext(sql, { kind: "system" }, (tx) => tx`update outbox_messages set status = 'sent', sent_at = now(), provider_id = ${providerId}, last_error = null, data = data - 'code' - 'link' where id = ${msg.id}`);
      continue;
    }
    const expired = msg.template === "login_code" && now.getTime() - msg.created_at.getTime() > LOGIN_CODE_TTL_MS;
    const giveUp = !result.retry || msg.attempts >= MAX_ATTEMPTS || expired;
    const next = new Date(now.getTime() + (BACKOFF_MS[msg.attempts - 1] ?? BACKOFF_MS.at(-1)!));
    const error = result.error;
    if (giveUp) console.error(`[e-mail] desistindo de ${msg.template} para ${msg.recipient}: ${error}`);
    await withContext(sql, { kind: "system" }, (tx) =>
      giveUp
        ? tx`update outbox_messages set status = 'failed', last_error = ${error}, data = data - 'code' - 'link' where id = ${msg.id}`
        : tx`update outbox_messages set last_error = ${error}, next_attempt_at = ${next} where id = ${msg.id}`,
    );
  }
  return batch.length;
}

/**
 * Notificação do Resend sobre uma mensagem enviada. Devolução definitiva e marcação como spam
 * colocam o endereço na lista de bloqueio: insistir prejudica a entrega de todos os outros e-mails.
 */
export async function handleEmailEvent(deps: Deps, event: { type: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string; message?: string } } }): Promise<void> {
  const data = event.data ?? {};
  const permanentBounce = event.type === "email.bounced" && (data.bounce?.type ?? "Permanent").toLowerCase() === "permanent";
  const complained = event.type === "email.complained";
  if (!permanentBounce && !complained && event.type !== "email.bounced") return;
  await withContext(deps.sql, { kind: "system" }, async (tx) => {
    const detail = (data.bounce?.message ?? event.type).slice(0, 300);
    if (data.email_id) await tx`update outbox_messages set status = 'failed', last_error = ${detail} where provider_id = ${data.email_id}`;
    if (!permanentBounce && !complained) return;
    for (const to of data.to ?? []) {
      await tx`insert into email_suppressions (email, reason, detail) values (${to.trim().toLowerCase()}, ${complained ? "complained" : "bounced"}, ${detail}) on conflict (email) do nothing`;
    }
  });
}
