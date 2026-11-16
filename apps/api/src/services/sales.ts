import {
  type FeeTable,
  type PaymentMethod,
  type ProviderEvent,
  type ReleasePolicy,
  formatBRL,
  planRelease,
  refundPostings,
  releasePostings,
  resolveFeeTable,
  resolveReleasePolicy,
  salePostings,
  withdrawalFailedPostings,
  withdrawalPostings,
  withdrawalSettledPostings,
} from "@domma/core";
import { decryptField } from "@domma/core/server";
import { type Tx, withContext } from "@domma/db";
import type { Deps } from "../lib/deps.ts";
import { conflict, forbidden, notFound, unprocessable } from "../lib/errors.ts";
import { createMagicLink } from "./auth.ts";
import { openChargeback } from "./chargebacks.ts";
import { getWallet, postLedger } from "./ledger.ts";
import { enqueueEmail } from "./notify.ts";
import { getPlatformSettings } from "./settings.ts";
import { emitEvent } from "./webhooks.ts";

const DAY_MS = 86_400_000;

export async function accountFeeTable(tx: Tx, accountId: string): Promise<FeeTable> {
  const settings = await getPlatformSettings(tx);
  const [account] = await tx`select fee_override from accounts where id = ${accountId}`;
  return resolveFeeTable(settings.fees, account?.fee_override);
}

/** Regra de liberação da conta hoje (item 12.4): depende da idade e dos indicadores dos últimos 90 dias. */
export async function accountReleasePolicy(tx: Tx, accountId: string, now: Date): Promise<ReleasePolicy> {
  const settings = await getPlatformSettings(tx);
  const [account] = await tx`select created_at, release_override from accounts where id = ${accountId}`;
  if (!account) throw notFound("Conta");
  const [stats] = await tx`
    select count(*) filter (where status in ('paid', 'refunded', 'chargeback')) as approved,
           count(*) filter (where status = 'refunded') as refunded,
           count(*) filter (where status = 'chargeback') as chargebacks
    from orders where account_id = ${accountId} and env = 'live' and created_at > ${new Date(now.getTime() - 90 * DAY_MS)}`;
  const approved = Math.max(1, stats?.approved ?? 0);
  return resolveReleasePolicy(
    {
      accountAgeDays: Math.floor((now.getTime() - account.created_at.getTime()) / DAY_MS),
      refundRateBps: Math.round(((stats?.refunded ?? 0) * 10000) / approved),
      chargebackRateBps: Math.round(((stats?.chargebacks ?? 0) * 10000) / approved),
    },
    settings.release,
    account.release_override,
  );
}

export function orderJson(o: Record<string, any>) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    method: o.method,
    installments: o.installments,
    env: o.env,
    product_id: o.product_id,
    offer_id: o.offer_id,
    gross_cents: o.gross_cents,
    discount_cents: o.discount_cents,
    buyer_total_cents: o.buyer_total_cents,
    interest_cents: o.interest_cents,
    fee_cents: o.fee_cents,
    net_cents: o.net_cents,
    origin: o.origin,
    utm: o.utm,
    refusal_reason: o.refusal_reason,
    guarantee_until: o.guarantee_until,
    paid_at: o.paid_at,
    refunded_at: o.refunded_at,
    created_at: o.created_at,
  };
}

/**
 * Confirma o pagamento de um pedido: divide o dinheiro no livro-razão, agenda as liberações,
 * libera o acesso e avisa todo mundo. Pode ser chamada mais de uma vez sem duplicar nada.
 */
export async function settleOrderPaid(tx: Tx, deps: Deps, orderId: string, paidAt: Date): Promise<boolean> {
  const [order] = await tx`select * from orders where id = ${orderId} for update`;
  if (!order) throw notFound("Pedido");
  if (order.status !== "pending") return false;

  const [product] = await tx`select name, guarantee_days from products where id = ${order.product_id}`;
  const [buyer] = await tx`select id, name, email from users where id = ${order.buyer_user_id}`;
  const guaranteeUntil = new Date(paidAt.getTime() + (product!.guarantee_days as number) * DAY_MS);

  // Pedidos do ambiente de testes não movimentam dinheiro.
  let release: (ReturnType<typeof planRelease> & { tier: string }) | null = null;
  if (order.env === "live") {
    const policy = await accountReleasePolicy(tx, order.account_id, paidAt);
    const plan = planRelease(order.net_cents, order.method as PaymentMethod, paidAt, policy);
    release = { ...plan, tier: policy.tier };
    await postLedger(tx, {
      kind: "sale",
      accountId: order.account_id,
      orderId,
      description: `Venda #${order.number} · ${product!.name}`,
      postings: salePostings({ accountId: order.account_id, buyerTotalCents: order.buyer_total_cents, netCents: order.net_cents, reserveCents: plan.reserveCents }),
    });
    if (plan.pendingCents > 0)
      await tx`insert into scheduled_releases (account_id, order_id, from_kind, amount_cents, release_at)
               values (${order.account_id}, ${orderId}, 'pending', ${plan.pendingCents}, ${plan.releaseAt})`;
    if (plan.reserveCents > 0)
      await tx`insert into scheduled_releases (account_id, order_id, from_kind, amount_cents, release_at)
               values (${order.account_id}, ${orderId}, 'reserved', ${plan.reserveCents}, ${plan.reserveReleaseAt})`;
  }

  const [paid] = await tx`
    update orders set status = 'paid', paid_at = ${paidAt}, guarantee_until = ${guaranteeUntil},
      release_snapshot = ${release ? tx.json(release as never) : null}
    where id = ${orderId} returning *`;
  await tx`update payments set status = 'confirmed', confirmed_at = ${paidAt} where order_id = ${orderId} and status = 'pending'`;
  if (order.checkout_session_id) await tx`update checkout_sessions set stage = 'paid' where id = ${order.checkout_session_id}`;
  if (order.coupon_id) await tx`update coupons set used_count = used_count + 1 where id = ${order.coupon_id}`;

  const items = await tx`select distinct product_id from order_items where order_id = ${orderId}`;
  for (const item of items) {
    await tx`
      insert into enrollments (account_id, product_id, user_id, order_id) values (${order.account_id}, ${item.product_id}, ${buyer!.id}, ${orderId})
      on conflict (product_id, user_id) where status = 'active' do nothing`;
  }

  // O link do e-mail prova que a pessoa é dona do endereço, então abre a sessão completa.
  const link = await createMagicLink(tx, deps.config, { userId: buyer!.id, redirectTo: `/assistir/${order.product_id}`, ttlMinutes: 7 * 24 * 60 });
  await enqueueEmail(tx, buyer!.email, "access_granted", { name: (buyer!.name as string).split(" ")[0], product: product!.name, link });
  await emitEvent(tx, order.account_id, "order.paid", { order: orderJson(paid!), customer: { name: buyer!.name, email: buyer!.email } });
  await emitEvent(tx, order.account_id, "access.granted", { order_id: orderId, product_ids: items.map((i) => i.product_id), customer: { email: buyer!.email } });
  await tx`select pg_notify('order_status', ${`${orderId}:paid`})`;
  return true;
}

/** Trata a notificação já validada do provedor de pagamento. */
export async function handleProviderEvent(deps: Deps, event: ProviderEvent): Promise<void> {
  const { sql, provider } = deps;
  if (event.type === "payment.confirmed" || event.type === "payment.expired") {
    await withContext(sql, { kind: "system" }, async (tx) => {
      const [payment] = await tx`select id, order_id, account_id, status from payments where provider = ${provider.name} and provider_ref = ${event.providerRef} for update`;
      if (!payment) return;
      if (event.type === "payment.confirmed") {
        await settleOrderPaid(tx, deps, payment.order_id, event.paidAt);
      } else if (payment.status === "pending") {
        await tx`update payments set status = 'expired' where id = ${payment.id}`;
        const [order] = await tx`update orders set status = 'expired' where id = ${payment.order_id} and status = 'pending' returning *`;
        if (order) {
          await emitEvent(tx, payment.account_id, "pix.expired", { order: orderJson(order) });
          await tx`select pg_notify('order_status', ${`${order.id}:expired`})`;
        }
      }
    });
    return;
  }
  if (event.type === "payment.chargeback") {
    await withContext(sql, { kind: "system" }, async (tx) => {
      const [payment] = await tx`select order_id from payments where provider = ${provider.name} and provider_ref = ${event.providerRef}`;
      if (payment) await openChargeback(tx, deps, { orderId: payment.order_id, reason: event.reason, dueAt: event.dueAt });
    });
    return;
  }
  // Saques
  await withContext(sql, { kind: "system" }, async (tx) => {
    const [w] = await tx`select * from withdrawals where provider = ${provider.name} and provider_ref = ${event.providerRef} for update`;
    if (!w || w.status !== "processing") return;
    const [owner] = await tx`select u.email from accounts a join users u on u.id = a.owner_user_id where a.id = ${w.account_id}`;
    if (event.type === "payout.completed") {
      await postLedger(tx, { kind: "withdrawal_settled", withdrawalId: w.id, description: "Saque concluído", postings: withdrawalSettledPostings({ amountCents: w.amount_cents }) });
      await tx`update withdrawals set status = 'completed', completed_at = now() where id = ${w.id}`;
      await emitEvent(tx, w.account_id, "withdrawal.completed", { withdrawal_id: w.id, amount_cents: w.amount_cents });
      await enqueueEmail(tx, owner!.email, "withdrawal_update", { title: "Seu saque foi concluído", message: `O valor já está na sua chave Pix ${w.pix_key_masked}.`, amount_cents: w.amount_cents });
    } else {
      await postLedger(tx, {
        kind: "withdrawal_failed",
        accountId: w.account_id,
        withdrawalId: w.id,
        description: "Saque não concluído — valor devolvido ao saldo",
        postings: withdrawalFailedPostings({ accountId: w.account_id, amountCents: w.amount_cents }),
      });
      await tx`update withdrawals set status = 'failed', failure_reason = ${event.reason} where id = ${w.id}`;
      await emitEvent(tx, w.account_id, "withdrawal.failed", { withdrawal_id: w.id, amount_cents: w.amount_cents, reason: event.reason });
      await enqueueEmail(tx, owner!.email, "withdrawal_update", { title: "Seu saque não foi concluído", message: "O valor voltou para o seu saldo disponível. Confira a chave Pix e tente de novo.", amount_cents: w.amount_cents });
    }
  });
}

/** Passa para "disponível" tudo o que venceu em "a liberar" e "reservado". */
export async function runDueReleases(deps: Deps, limit = 200): Promise<number> {
  return withContext(deps.sql, { kind: "system" }, async (tx) => {
    const due = await tx`
      select r.id, r.account_id, r.order_id, r.from_kind, r.amount_cents, o.number
      from scheduled_releases r join orders o on o.id = r.order_id
      where r.status = 'scheduled' and r.release_at <= ${deps.now()}
      order by r.release_at limit ${limit} for update of r skip locked`;
    for (const r of due) {
      const ledgerId = await postLedger(tx, {
        kind: "release",
        accountId: r.account_id,
        orderId: r.order_id,
        description: r.from_kind === "reserved" ? `Reserva devolvida · venda #${r.number}` : `Valor liberado · venda #${r.number}`,
        postings: releasePostings({ accountId: r.account_id, from: r.from_kind, amountCents: r.amount_cents }),
      });
      await tx`update scheduled_releases set status = 'released', ledger_transaction_id = ${ledgerId} where id = ${r.id}`;
    }
    return due.length;
  });
}

// ───────────────────────── Reembolso ─────────────────────────

export type RefundKind = "within_guarantee" | "producer_decision" | "producer_initiated";

/**
 * Executa o reembolso total: estorna o livro-razão, cancela o acesso e registra a linha do tempo.
 * A devolução no provedor acontece em seguida (processRefund), fora desta transação.
 */
export async function executeRefund(
  deps: Deps,
  input: { orderId: string; kind: RefundKind; reason?: string | null; requestedBy?: string | null; accountId?: string },
): Promise<string> {
  const refundId = await withContext(deps.sql, { kind: "system" }, async (tx) => {
    const [order] = await tx`select * from orders where id = ${input.orderId} for update`;
    if (!order || (input.accountId && order.account_id !== input.accountId)) throw notFound("Pedido");
    const [existing] = await tx`select id, status from refunds where order_id = ${order.id} for update`;
    if (order.status === "refunded" || (existing && existing.status !== "requested")) throw conflict("already_refunded", "Este pedido já foi reembolsado.");
    if (order.status !== "paid") throw unprocessable("order_not_paid", "Só é possível reembolsar um pedido pago.");

    if (order.env === "live") {
      const canceled = await tx`
        update scheduled_releases set status = 'canceled' where order_id = ${order.id} and status = 'scheduled'
        returning from_kind, amount_cents`;
      const unreleased = (kind: string) => canceled.filter((r) => r.from_kind === kind).reduce((a, r) => a + r.amount_cents, 0);
      await postLedger(tx, {
        kind: "refund",
        accountId: order.account_id,
        orderId: order.id,
        description: `Reembolso · venda #${order.number}`,
        postings: refundPostings({
          accountId: order.account_id,
          buyerTotalCents: order.buyer_total_cents,
          netCents: order.net_cents,
          unreleasedPendingCents: unreleased("pending"),
          unreleasedReserveCents: unreleased("reserved"),
        }),
      });
    }

    const [refunded] = await tx`update orders set status = 'refunded', refunded_at = now() where id = ${order.id} returning *`;
    await tx`update enrollments set status = 'revoked', revoked_at = now() where order_id = ${order.id} and status = 'active'`;

    let id: string;
    if (existing) {
      id = existing.id;
      await tx`update refunds set status = 'approved' where id = ${id}`;
    } else {
      const [row] = await tx`
        insert into refunds (account_id, order_id, buyer_user_id, amount_cents, reason, kind, status, requested_by)
        values (${order.account_id}, ${order.id}, ${order.buyer_user_id}, ${order.buyer_total_cents}, ${input.reason ?? null}, ${input.kind}, 'approved', ${input.requestedBy ?? null})
        returning id`;
      id = row!.id;
      await refundEvent(tx, order.account_id, id, "requested", input.kind === "producer_initiated" ? "O produtor iniciou o seu reembolso." : "Recebemos o seu pedido de reembolso.");
    }
    await refundEvent(
      tx,
      order.account_id,
      id,
      "approved",
      input.kind === "within_guarantee" ? "Aprovado na hora: você pediu dentro do prazo de garantia." : "O produtor aprovou o seu reembolso.",
    );

    const [buyer] = await tx`select email from users where id = ${order.buyer_user_id}`;
    await enqueueEmail(tx, buyer!.email, "refund_update", {
      title: "reembolso aprovado",
      message: `Seu reembolso de ${formatBRL(order.buyer_total_cents)} foi aprovado. Você não precisa fazer mais nada.`,
      link: `${deps.config.webUrl}/reembolso/${id}`,
    });
    await emitEvent(tx, order.account_id, "order.refunded", { order: orderJson(refunded!), refund_id: id });
    await emitEvent(tx, order.account_id, "access.revoked", { order_id: order.id });
    return id;
  });
  await processRefund(deps, refundId).catch((err) => console.error("[reembolso] devolução no provedor falhou, a fila tenta de novo:", err));
  return refundId;
}

async function refundEvent(tx: Tx, accountId: string, refundId: string, step: string, message: string) {
  await tx`insert into refund_events (account_id, refund_id, step, message) values (${accountId}, ${refundId}, ${step}, ${message})`;
}

/** Envia a devolução ao provedor. Se falhar, o reembolso continua "aprovado" e a fila tenta de novo. */
export async function processRefund(deps: Deps, refundId: string): Promise<void> {
  const { sql, provider } = deps;
  const info = await withContext(sql, { kind: "system" }, async (tx) => {
    const [row] = await tx`
      select r.id, r.status, r.amount_cents, r.account_id, o.method, o.installments, p.provider_ref
      from refunds r join orders o on o.id = r.order_id
      left join payments p on p.order_id = o.id and p.status = 'confirmed'
      where r.id = ${refundId}`;
    return row;
  });
  if (!info || info.status !== "approved") return;
  const { refundRef } = info.provider_ref
    ? await provider.refund({ providerRef: info.provider_ref, amountCents: info.amount_cents, reference: refundId })
    : { refundRef: "sem-pagamento" };
  await withContext(sql, { kind: "system" }, async (tx) => {
    const [locked] = await tx`select status from refunds where id = ${refundId} for update`;
    if (locked?.status !== "approved") return;
    await tx`update payments set status = 'refunded', refund_ref = ${refundRef} where provider_ref = ${info.provider_ref} and status = 'confirmed'`;
    if (info.method === "pix") {
      // Pix é devolvido no mesmo dia para a conta de origem.
      await tx`update refunds set status = 'completed', refund_ref = ${refundRef} where id = ${refundId}`;
      await refundEvent(tx, info.account_id, refundId, "sent", "Pix devolvido para a conta que fez o pagamento.");
      await refundEvent(tx, info.account_id, refundId, "available", "O valor já está disponível na sua conta.");
    } else {
      await tx`update refunds set status = 'sent', refund_ref = ${refundRef} where id = ${refundId}`;
      const rest = info.installments > 1 ? ` As parcelas que faltavam foram canceladas.` : "";
      await refundEvent(tx, info.account_id, refundId, "sent", `Estorno enviado ao cartão.${rest}`);
    }
  });
}

export async function retryPendingRefunds(deps: Deps): Promise<number> {
  const rows = await withContext(deps.sql, { kind: "system" }, (tx) => tx`select id from refunds where status = 'approved' and updated_at < now() - interval '1 minute' limit 20`);
  for (const r of rows) await processRefund(deps, r.id).catch((err) => console.error("[reembolso]", err));
  return rows.length;
}

// ───────────────────────── Saque ─────────────────────────

export async function requestWithdrawal(deps: Deps, input: { accountId: string; amountCents: number; userId: string | null }) {
  const { sql, provider, config } = deps;
  const withdrawal = await withContext(sql, { kind: "system" }, async (tx) => {
    const settings = await getPlatformSettings(tx);
    const [account] = await tx`select * from accounts where id = ${input.accountId} for update`;
    if (!account) throw notFound("Conta");
    if (account.status !== "active") throw forbidden(`Sua conta está bloqueada${account.block_reason ? `: ${account.block_reason}` : "."}`);
    if (account.withdrawals_blocked_reason) throw forbidden(`Os saques desta conta estão pausados: ${account.withdrawals_blocked_reason}`);
    if (account.kyc_status !== "approved" || !account.pix_key_enc || !account.document_enc)
      throw unprocessable("identity_required", "Antes do primeiro saque, precisamos confirmar a sua identidade.");
    if (account.pix_key_changed_at) {
      const unlock = new Date(account.pix_key_changed_at.getTime() + settings.pixKeyChangeBlockHours * 3_600_000);
      if (unlock > deps.now())
        throw unprocessable("pix_key_recently_changed", `A chave Pix foi trocada há pouco. Por segurança, os saques voltam em ${unlock.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.`);
    }
    // Trava a carteira para dois saques simultâneos não usarem o mesmo saldo.
    await tx`select id from ledger_accounts where account_id = ${input.accountId} and kind = 'available' for update`;
    const wallet = await getWallet(tx, input.accountId);
    if (input.amountCents > wallet.available_cents)
      throw unprocessable("insufficient_balance", `Você tem ${formatBRL(Math.max(0, wallet.available_cents))} disponível para saque.`);
    if (account.withdrawal_daily_limit_cents != null) {
      const [today] = await tx`select coalesce(sum(amount_cents), 0) as total from withdrawals where account_id = ${input.accountId} and status <> 'failed' and created_at > now() - interval '24 hours'`;
      if (today!.total + input.amountCents > account.withdrawal_daily_limit_cents)
        throw unprocessable("daily_limit", `O limite de saque por dia desta conta é ${formatBRL(account.withdrawal_daily_limit_cents)}.`);
    }
    const pixKey = decryptField(account.pix_key_enc, config.fieldEncryptionKey);
    const [w] = await tx`
      insert into withdrawals (account_id, amount_cents, pix_key_masked, provider, requested_by)
      values (${input.accountId}, ${input.amountCents}, ${maskPixKey(pixKey)}, ${provider.name}, ${input.userId})
      returning *`;
    await postLedger(tx, {
      kind: "withdrawal",
      accountId: input.accountId,
      withdrawalId: w!.id,
      description: "Saque para sua chave Pix",
      postings: withdrawalPostings({ accountId: input.accountId, amountCents: input.amountCents }),
    });
    return { row: w!, pixKey, document: decryptField(account.document_enc, config.fieldEncryptionKey) };
  });

  try {
    const payout = await provider.createPayout({ reference: withdrawal.row.id, amountCents: input.amountCents, pixKey: withdrawal.pixKey, document: withdrawal.document });
    await withContext(sql, { kind: "system" }, (tx) => tx`update withdrawals set provider_ref = ${payout.providerRef} where id = ${withdrawal.row.id}`);
    // O provedor simulado conclui na hora; os reais avisam por notificação.
    if (provider.name === "sandbox") await handleProviderEvent(deps, { type: "payout.completed", providerRef: payout.providerRef });
  } catch (err) {
    console.error("[saque] falha ao enviar ao provedor:", err);
    const ref = `falha_${withdrawal.row.id}`;
    await withContext(sql, { kind: "system" }, (tx) => tx`update withdrawals set provider_ref = ${ref} where id = ${withdrawal.row.id}`);
    await handleProviderEvent(deps, { type: "payout.failed", providerRef: ref, reason: "provider_error" });
  }
  const [final] = await withContext(sql, { kind: "system" }, (tx) => tx`select * from withdrawals where id = ${withdrawal.row.id}`);
  return final!;
}

export function maskPixKey(key: string): string {
  if (key.includes("@")) {
    const [user = "", domain = ""] = key.split("@");
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  return `•••${key.slice(-4)}`;
}
