import { formatBRL } from "@domma/core";
import type { Tx } from "@domma/db";
import { withContext } from "@domma/db";
import type { Deps } from "../lib/deps.ts";

export type EmailTemplate = "login_code" | "access_granted" | "refund_update" | "withdrawal_update" | "pix_key_changed" | "product_review";

/** Coloca a mensagem na fila dentro da mesma transação: se a operação falhar, nada é enviado. */
export async function enqueueEmail(tx: Tx, to: string, template: EmailTemplate, data: Record<string, unknown>) {
  await tx`insert into outbox_messages (channel, recipient, template, data) values ('email', ${to}, ${template}, ${tx.json(data as never)})`;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function render(template: string, d: Record<string, unknown>): { subject: string; html: string } {
  const button = (href: unknown, label: string) =>
    `<p><a href="${esc(href)}" style="background:#FFD600;color:#0B0B0C;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">${label}</a></p>`;
  const wrap = (body: string) => `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:480px">${body}<p style="color:#777;font-size:13px">Domma Mart</p></div>`;
  switch (template) {
    case "login_code":
      return {
        subject: `Seu código: ${d.code}`,
        html: wrap(`<p>Seu código do Domma Mart é:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${esc(d.code)}</p><p>Ele vale por 10 minutos e só pode ser usado uma vez. Se não foi você, ignore esta mensagem.</p>`),
      };
    case "access_granted":
      return {
        subject: `Seu acesso a ${d.product} está liberado`,
        html: wrap(`<p>Olá, ${esc(d.name)}.</p><p>O pagamento foi aprovado e o seu acesso a <b>${esc(d.product)}</b> já está liberado. Não precisa criar senha.</p>${button(d.link, "Acessar meu produto")}`),
      };
    case "refund_update":
      return { subject: `Seu reembolso: ${d.title}`, html: wrap(`<p>${esc(d.message)}</p>${button(d.link, "Acompanhar reembolso")}`) };
    case "withdrawal_update":
      return { subject: String(d.title), html: wrap(`<p>${esc(d.message)}</p><p>Valor: <b>${formatBRL(Number(d.amount_cents ?? 0))}</b></p>`) };
    case "pix_key_changed":
      return {
        subject: "Sua chave Pix de saque foi trocada",
        html: wrap(`<p>A chave Pix usada para saques foi trocada. Por segurança, os saques ficam pausados por ${esc(d.hours)} horas.</p><p>Se não foi você, fale com a gente agora.</p>`),
      };
    case "product_review":
      return { subject: String(d.title), html: wrap(`<p>${esc(d.message)}</p>`) };
    default:
      return { subject: "Domma Mart", html: wrap(`<p>${esc(JSON.stringify(d))}</p>`) };
  }
}

/** Envia o que está na fila. Sem chave do Resend, a mensagem sai no log (desenvolvimento). */
export async function deliverOutbox(deps: Deps, limit = 20): Promise<number> {
  const { sql, config } = deps;
  const batch = await withContext(sql, { kind: "system" }, (tx) => tx`
    update outbox_messages set attempts = attempts + 1
    where id in (select id from outbox_messages where status = 'pending' and attempts < 5 order by created_at limit ${limit} for update skip locked)
    returning id, recipient, template, data`);
  for (const msg of batch) {
    let error: string | null = null;
    try {
      const { subject, html } = render(msg.template, msg.data);
      if (config.resendApiKey) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${config.resendApiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ from: config.emailFrom, to: msg.recipient, subject, html }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) error = `Resend respondeu ${res.status}`;
      } else if (config.env === "development") {
        console.log(`[e-mail] para ${msg.recipient}: ${subject}${msg.data.link ? ` → ${msg.data.link}` : ""}`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    await withContext(sql, { kind: "system" }, (tx) =>
      error
        ? tx`update outbox_messages set last_error = ${error}, status = case when attempts >= 5 then 'failed' else 'pending' end where id = ${msg.id}`
        : // Depois de enviado, o código de acesso não fica guardado.
          tx`update outbox_messages set status = 'sent', sent_at = now(), data = data - 'code' - 'link' where id = ${msg.id}`,
    );
  }
  return batch.length;
}
