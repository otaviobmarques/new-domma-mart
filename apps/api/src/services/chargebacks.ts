import { chargebackLostPostings, chargebackOpenedPostings, chargebackWonPostings, formatBRL } from "@domma/core";
import type { Tx } from "@domma/db";
import type { Deps } from "../lib/deps.ts";
import { conflict, notFound, unprocessable } from "../lib/errors.ts";
import { postLedger } from "./ledger.ts";
import { enqueueEmail } from "./notify.ts";
import { orderJson } from "./sales.ts";
import { emitEvent } from "./webhooks.ts";

const fmtDay = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Abre a contestação de uma venda (chargeback): separa o valor em "em contestação", cancela as
 * liberações agendadas e avisa o produtor com o prazo para enviar provas. Pode ser chamada duas vezes
 * sem duplicar nada.
 */
export async function openChargeback(tx: Tx, deps: Deps, input: { orderId: string; reason: string; dueAt: Date }): Promise<string | null> {
  const [order] = await tx`select * from orders where id = ${input.orderId} for update`;
  if (!order) throw notFound("Pedido");
  const [existing] = await tx`select id from chargebacks where order_id = ${order.id}`;
  if (existing) return existing.id;
  if (order.status !== "paid") return null;

  if (order.env === "live") {
    const canceled = await tx`
      update scheduled_releases set status = 'canceled' where order_id = ${order.id} and status = 'scheduled'
      returning from_kind, amount_cents`;
    const unreleased = (kind: string) => canceled.filter((r) => r.from_kind === kind).reduce((a, r) => a + r.amount_cents, 0);
    await postLedger(tx, {
      kind: "chargeback",
      accountId: order.account_id,
      orderId: order.id,
      description: `Contestação aberta · venda #${order.number}`,
      postings: chargebackOpenedPostings({
        accountId: order.account_id,
        netCents: order.net_cents,
        unreleasedPendingCents: unreleased("pending"),
        unreleasedReserveCents: unreleased("reserved"),
      }),
    });
  }
  const [updated] = await tx`update orders set status = 'chargeback' where id = ${order.id} returning *`;
  const [cb] = await tx`
    insert into chargebacks (account_id, order_id, amount_cents, reason, due_at)
    values (${order.account_id}, ${order.id}, ${order.buyer_total_cents}, ${input.reason}, ${input.dueAt}) returning id`;
  const [owner] = await tx`select u.email from accounts a join users u on u.id = a.owner_user_id where a.id = ${order.account_id}`;
  await enqueueEmail(tx, owner!.email, "notice", {
    title: `Contestação na venda #${order.number}: envie as provas até ${fmtDay(input.dueAt)}`,
    message: `O comprador contestou a compra de ${formatBRL(order.buyer_total_cents)} junto ao banco (${input.reason}). O valor fica separado até o resultado.\n\nAbra a venda no painel e conte o que comprova a entrega. A equipe Domma junta isso aos registros de acesso e envia a defesa por você.`,
    link: `${deps.config.webUrl}/painel/vendas/${order.id}`,
    link_label: "Enviar provas",
  });
  await emitEvent(tx, order.account_id, "order.chargeback", { order: orderJson(updated!), chargeback: { id: cb!.id, reason: input.reason, due_at: input.dueAt } });
  return cb!.id;
}

/** Registra o resultado que veio da adquirente. Ganhou: o valor volta ao produtor. Perdeu: volta ao comprador. */
export async function resolveChargeback(tx: Tx, id: string, result: "won" | "lost") {
  const [cb] = await tx`select * from chargebacks where id = ${id} for update`;
  if (!cb) throw notFound("Contestação");
  if (cb.status === "won" || cb.status === "lost") throw conflict("already_resolved", "Esta contestação já tem resultado registrado.");
  if (cb.status !== "defended") throw unprocessable("defense_not_sent", "Registre o envio da defesa antes de informar o resultado.");
  const [order] = await tx`select * from orders where id = ${cb.order_id} for update`;
  if (order!.env === "live") {
    await postLedger(tx, {
      kind: result === "won" ? "chargeback_won" : "chargeback_lost",
      accountId: cb.account_id,
      orderId: cb.order_id,
      description: result === "won" ? `Contestação ganha · venda #${order!.number}` : `Contestação perdida · venda #${order!.number}`,
      postings:
        result === "won"
          ? chargebackWonPostings({ accountId: cb.account_id, netCents: order!.net_cents })
          : chargebackLostPostings({ accountId: cb.account_id, buyerTotalCents: order!.buyer_total_cents, netCents: order!.net_cents }),
    });
  }
  await tx`update chargebacks set status = ${result}, resolved_at = now() where id = ${id}`;
  const [owner] = await tx`select u.email from accounts a join users u on u.id = a.owner_user_id where a.id = ${cb.account_id}`;
  if (result === "won") {
    await tx`update orders set status = 'paid' where id = ${cb.order_id}`;
    await enqueueEmail(tx, owner!.email, "product_review", {
      title: `Você ganhou a contestação da venda #${order!.number}`,
      message: `O valor de ${formatBRL(order!.net_cents)} voltou para o seu saldo disponível.`,
    });
  } else {
    await tx`update enrollments set status = 'revoked', revoked_at = now() where order_id = ${cb.order_id} and status = 'active'`;
    await tx`update payments set status = 'refunded' where order_id = ${cb.order_id} and status = 'confirmed'`;
    await emitEvent(tx, cb.account_id, "access.revoked", { order_id: cb.order_id });
    await enqueueEmail(tx, owner!.email, "product_review", {
      title: `A contestação da venda #${order!.number} foi perdida`,
      message: `O banco decidiu a favor do comprador. O valor da venda foi devolvido a ele e o acesso ao produto foi cancelado.`,
    });
  }
  return { id, status: result, account_id: cb.account_id as string };
}
