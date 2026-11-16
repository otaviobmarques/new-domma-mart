import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { notFound, unprocessable } from "../lib/errors.ts";
import type { Router } from "../lib/router.ts";
import { audit } from "../services/audit.ts";
import { getWallet } from "../services/ledger.ts";
import { enqueueEmail } from "../services/notify.ts";
import { accountFeeTable, accountReleasePolicy } from "../services/sales.ts";
import { getPlatformSettings } from "../services/settings.ts";
import { uuidOr404 } from "./seller.ts";

const TZ = "America/Sao_Paulo";

/** Backoffice básico (fase 1). Toda decisão fica registrada com usuário, data e motivo. */
export function backofficeRoutes(r: Router, deps: Deps) {
  r.get("/v1/backoffice/overview", { access: "backoffice", tag: "Backoffice", summary: "Painel da plataforma", hidden: true }, async ({ db }) =>
    db(async (tx) => {
      const [today] = await tx`
        select coalesce(sum(buyer_total_cents), 0) as volume_cents, count(*) as orders, coalesce(sum(buyer_total_cents - net_cents), 0) as revenue_cents
        from orders where status = 'paid' and env = 'live' and paid_at >= date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}`;
      const [card] = await tx`
        select count(*) filter (where status in ('paid', 'refunded', 'chargeback')) as approved, count(*) filter (where status = 'refused') as refused
        from orders where method = 'card' and env = 'live' and created_at > now() - interval '7 days'`;
      const [month] = await tx`
        select count(*) filter (where status = 'refunded') as refunded, count(*) filter (where status = 'chargeback') as chargebacks,
               count(*) filter (where status in ('paid', 'refunded', 'chargeback')) as approved
        from orders where env = 'live' and created_at >= date_trunc('month', now())`;
      const [queue] = await tx`
        select (select count(*) from products where status = 'in_review') as products,
               (select count(*) from accounts where kyc_status = 'in_review') as accounts,
               (select count(*) from link_reports where status = 'open') as link_reports,
               (select count(*) from product_reports where status = 'open') as product_reports`;
      const chart = await tx`
        select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(sum(o.buyer_total_cents), 0) as total_cents
        from generate_series((now() at time zone ${TZ})::date - 13, (now() at time zone ${TZ})::date, interval '1 day') as d(day)
        left join orders o on o.status = 'paid' and o.env = 'live' and (o.paid_at at time zone ${TZ})::date = d.day::date
        group by d.day order by d.day`;
      const cardTotal = card!.approved + card!.refused;
      return {
        today,
        card_approval_bps: cardTotal ? Math.round((card!.approved * 10000) / cardTotal) : null,
        refund_rate_bps: month!.approved ? Math.round((month!.refunded * 10000) / month!.approved) : 0,
        chargeback_rate_bps: month!.approved ? Math.round((month!.chargebacks * 10000) / month!.approved) : 0,
        queue,
        chart,
      };
    }),
  );

  r.get("/v1/backoffice/queue", { access: "backoffice", tag: "Backoffice", summary: "Fila de contas e de produtos", hidden: true }, async ({ db }) =>
    db(async (tx) => ({
      products: await tx`
        select p.id, p.name, p.description, p.type, p.review_triage, p.review_reason, p.updated_at, p.account_id, a.name as seller_name, a.kyc_status,
               (select count(*) from products x where x.account_id = p.account_id and x.status = 'approved') as approved_before,
               (select o.price_cents from offers o where o.product_id = p.id and o.is_default) as price_cents
        from products p join accounts a on a.id = p.account_id where p.status = 'in_review' order by p.updated_at`,
      accounts: await tx`
        select a.id, a.name, a.kyc_status, a.created_at, u.email from accounts a join users u on u.id = a.owner_user_id
        where a.kyc_status = 'in_review' order by a.updated_at`,
      link_reports: await tx`select id, url, reporter_contact, created_at from link_reports where status = 'open' order by created_at`,
      tickets: await tx`
        select t.id, t.number, t.topic, t.message, t.due_at, t.created_at, u.name as user_name, u.email, p.name as product_name
        from support_tickets t join users u on u.id = t.user_id left join orders o on o.id = t.order_id left join products p on p.id = o.product_id
        where t.status = 'open' order by t.due_at`,
    })),
  );

  r.post(
    "/v1/backoffice/products/:id/decision",
    {
      access: "backoffice",
      tag: "Backoffice",
      summary: "Aprovar, recusar ou pedir correção de um produto",
      hidden: true,
      body: z
        .object({ decision: z.enum(["approve", "reject", "request_changes"]), reason: z.string().trim().max(1000).default("") })
        .refine((b) => b.decision === "approve" || b.reason.length >= 5, "Escreva o motivo da decisão"),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const [product] = await tx`select p.id, p.name, p.status, p.account_id, u.email from products p join accounts a on a.id = p.account_id join users u on u.id = a.owner_user_id where p.id = ${uuidOr404(params.id!)} for update of p`;
        if (!product) throw notFound("Produto");
        if (product.status !== "in_review") throw unprocessable("not_in_review", "Este produto não está na fila de análise.");
        const status = { approve: "approved", reject: "blocked", request_changes: "draft" }[body.decision];
        await tx`update products set status = ${status}, review_reason = ${body.reason || "Aprovado pela equipe"}, reviewed_at = now() where id = ${product.id}`;
        await audit(tx, { auth, actorKind: "backoffice", accountId: product.account_id, action: `product.review.${body.decision}`, target: product.id, data: { reason: body.reason } });
        const message = {
          approve: `Seu produto "${product.name}" foi aprovado e já pode vender.`,
          reject: `Seu produto "${product.name}" não foi aprovado. Motivo: ${body.reason} Você pode contestar respondendo este e-mail; a resposta sai em até 5 dias úteis.`,
          request_changes: `Seu produto "${product.name}" precisa de um ajuste antes de ir ao ar: ${body.reason}`,
        }[body.decision];
        await enqueueEmail(tx, product.email, "product_review", { title: `Análise do produto: ${product.name}`, message });
        return { id: product.id, status };
      }),
  );

  r.post(
    "/v1/backoffice/accounts/:id/kyc",
    {
      access: "backoffice",
      tag: "Backoffice",
      summary: "Decidir a verificação de identidade de uma conta",
      hidden: true,
      body: z
        .object({ decision: z.enum(["approve", "pending"]), note: z.string().trim().max(1000).default("") })
        .refine((b) => b.decision === "approve" || b.note.length >= 5, "Escreva o que a pessoa precisa corrigir"),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const status = body.decision === "approve" ? "approved" : "pending";
        const [account] = await tx`update accounts set kyc_status = ${status}, kyc_note = ${body.note || null} where id = ${uuidOr404(params.id!)} and kyc_status = 'in_review' returning id`;
        if (!account) throw notFound("Conta em análise");
        await audit(tx, { auth, actorKind: "backoffice", accountId: account.id, action: `account.kyc.${body.decision}`, data: { note: body.note } });
        return { id: account.id, kyc_status: status };
      }),
  );

  r.post(
    "/v1/backoffice/tickets/:id/answer",
    { access: "backoffice", tag: "Backoffice", summary: "Responder um pedido de atendimento", hidden: true, body: z.object({ answer: z.string().trim().min(5).max(4000) }) },
    async ({ params, body, db, auth, userId }) =>
      db(async (tx) => {
        const [ticket] = await tx`
          update support_tickets set status = 'answered', answer = ${body.answer}, answered_by = ${userId}, answered_at = now()
          where id = ${uuidOr404(params.id!)} and status = 'open' returning id, number, user_id`;
        if (!ticket) throw notFound("Pedido de atendimento");
        const [user] = await tx`select email from users where id = ${ticket.user_id}`;
        await enqueueEmail(tx, user!.email, "product_review", { title: `Resposta ao seu pedido de ajuda #${ticket.number}`, message: body.answer });
        await audit(tx, { auth, actorKind: "backoffice", action: "ticket.answered", target: ticket.id });
        return { ok: true };
      }),
  );

  r.get(
    "/v1/backoffice/accounts",
    { access: "backoffice", tag: "Backoffice", summary: "Buscar contas de produtor", hidden: true, query: z.object({ q: z.string().trim().max(120).optional() }) },
    async ({ query, db }) =>
      db(async (tx) => {
        const like = query.q ? `%${query.q.toLowerCase()}%` : null;
        return {
          data: await tx`
            select a.id, a.name, a.status, a.kyc_status, a.withdrawals_blocked_reason, a.created_at, u.email,
                   (select count(*) from products p where p.account_id = a.id) as products
            from accounts a join users u on u.id = a.owner_user_id
            where (${like}::text is null or lower(a.name) like ${like} or u.email like ${like})
            order by a.created_at desc limit 50`,
        };
      }),
  );

  r.get("/v1/backoffice/accounts/:id", { access: "backoffice", tag: "Backoffice", summary: "Conta do produtor (visão completa)", hidden: true }, async ({ params, db, auth }) =>
    db(async (tx) => {
      const [account] = await tx`
        select a.id, a.name, a.status, a.block_reason, a.withdrawals_blocked_reason, a.kyc_status, a.created_at, a.fee_override, a.release_override,
               a.withdrawal_daily_limit_cents, u.email
        from accounts a join users u on u.id = a.owner_user_id where a.id = ${uuidOr404(params.id!)}`;
      if (!account) throw notFound("Conta");
      const [stats] = await tx`
        select coalesce(sum(gross_cents) filter (where status = 'paid'), 0) as sold_30d_cents,
               count(*) filter (where status = 'refunded') as refunded, count(*) filter (where status in ('paid', 'refunded', 'chargeback')) as approved
        from orders where account_id = ${account.id} and env = 'live' and created_at > now() - interval '30 days'`;
      const history = await tx`select action, actor_kind, data, created_at from audit_log where account_id = ${account.id} order by created_at desc limit 30`;
      // Quem viu o quê também fica registrado.
      await audit(tx, { auth, actorKind: "backoffice", accountId: account.id, action: "account.viewed" });
      return {
        ...account,
        wallet: await getWallet(tx, account.id),
        stats,
        fees: await accountFeeTable(tx, account.id),
        release_policy: await accountReleasePolicy(tx, account.id, deps.now()),
        history,
      };
    }),
  );

  r.post(
    "/v1/backoffice/accounts/:id/withdrawals-block",
    {
      access: "backoffice",
      tag: "Backoffice",
      summary: "Pausar ou liberar os saques de uma conta, sempre com motivo por escrito",
      hidden: true,
      body: z.object({ blocked: z.boolean(), reason: z.string().trim().min(5).max(1000) }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const [account] = await tx`update accounts set withdrawals_blocked_reason = ${body.blocked ? body.reason : null} where id = ${uuidOr404(params.id!)} returning id`;
        if (!account) throw notFound("Conta");
        await audit(tx, { auth, actorKind: "backoffice", accountId: account.id, action: body.blocked ? "account.withdrawals_blocked" : "account.withdrawals_unblocked", data: { reason: body.reason } });
        return { ok: true };
      }),
  );

  r.get("/v1/backoffice/settings", { access: "backoffice", tag: "Backoffice", summary: "Configurações da plataforma em vigor", hidden: true }, async ({ db }) => db((tx) => getPlatformSettings(tx)));
}
