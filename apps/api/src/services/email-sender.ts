import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "../env.ts";

export interface OutgoingEmail {
  /** Identificador da mensagem na fila: usado para o provedor não enviar duas vezes a mesma. */
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
}

export type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean; error: string };

export interface EmailSender {
  name: string;
  send(message: OutgoingEmail): Promise<SendResult>;
}

/** Envio pelo Resend. A chave de repetição garante que uma nova tentativa não vira um segundo e-mail. */
export function resendSender(config: Config, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    name: "resend",
    async send(message) {
      let res: Response;
      try {
        res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${config.resendApiKey}`, "content-type": "application/json", "idempotency-key": `domma-${message.id}` },
          body: JSON.stringify({
            from: config.emailFrom,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(config.emailReplyTo ? { reply_to: config.emailReplyTo } : {}),
            tags: [{ name: "template", value: message.template }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        return { ok: false, retry: true, error: err instanceof Error ? err.message : String(err) };
      }
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, providerId: body.id ?? null };
      }
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      // Limite de envio e falha do provedor valem nova tentativa; erro no pedido (endereço inválido, remetente não verificado) não.
      return { ok: false, retry: res.status === 429 || res.status === 409 || res.status >= 500, error: `Resend respondeu ${res.status}: ${detail}` };
    },
  };
}

/** Sem chave configurada: a mensagem só aparece no log (desenvolvimento). */
export function logSender(config: Config): EmailSender {
  return {
    name: "log",
    async send(message) {
      if (config.env === "development") {
        const link = message.text.match(/https?:\/\/\S+/)?.[0];
        console.log(`[e-mail] para ${message.to}: ${message.subject}${link ? ` → ${link}` : ""}`);
      }
      return { ok: true, providerId: null };
    },
  };
}

export const defaultSender = (config: Config): EmailSender => (config.resendApiKey ? resendSender(config) : logSender(config));

/**
 * Confere a assinatura das notificações do Resend (padrão Svix): HMAC-SHA256 de "id.timestamp.corpo"
 * com o segredo "whsec_…", e no máximo 5 minutos de diferença no relógio.
 */
export function verifyResendWebhook(secret: string, headers: Record<string, string | undefined>, rawBody: string, now = Date.now()): boolean {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signatures = headers["svix-signature"];
  if (!id || !timestamp || !signatures) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
