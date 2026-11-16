import { decryptField } from "@domma/core/server";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { resolveFeeTable } from "@domma/core";
import { forbidden, notFound, unprocessable } from "../lib/errors.ts";
import { type Router, created } from "../lib/router.ts";
import { audit } from "../services/audit.ts";
import { getWallet } from "../services/ledger.ts";
import { enqueueEmail } from "../services/notify.ts";
import { resolveChargeback } from "../services/chargebacks.ts";
import { accountFeeTable, accountReleasePolicy, handleProviderEvent } from "../services/sales.ts";
import { getPlatformSettings } from "../services/settings.ts";
import { signedUrl } from "./files.ts";
import { uuidOr404 } from "./seller.ts";

const TZ = "America/Sao_Paulo";

/** Backoffice: filas, contas, risco e configurações. Toda decisão fica registrada com usuário, data e motivo. */
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
        select a.id, a.name, a.kyc_status, a.created_at, u.email,
               (select s.created_at from kyc_submissions s where s.account_id = a.id and s.status = 'pending' order by s.created_at desc limit 1) as documents_sent_at
        from accounts a join users u on u.id = a.owner_user_id
        where a.kyc_status = 'in_review' order by a.updated_at`,
      link_reports: await tx`select id, url, reporter_contact, created_at from link_reports where status = 'open' order by created_at`,
      tickets: await tx`
        select t.id, t.number, t.topic, t.message, t.source, t.due_at, t.created_at, u.name as user_name, u.email, p.name as product_name
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
    async ({ params, body, db, auth, userId }) =>
      db(async (tx) => {
        const status = body.decision === "approve" ? "approved" : "pending";
        const [account] = await tx`
          update accounts a set kyc_status = ${status}, kyc_note = ${body.note || null} where id = ${uuidOr404(params.id!)} and kyc_status = 'in_review'
          returning id, name, (select email from users where id = a.owner_user_id) as email`;
        if (!account) throw notFound("Conta em análise");
        await tx`
          update kyc_submissions set status = ${body.decision === "approve" ? "approved" : "returned"}, note = ${body.note || null}, decided_by = ${userId}, decided_at = now()
          where account_id = ${account.id} and status = 'pending'`;
        await enqueueEmail(tx, account.email, "notice", {
          title: body.decision === "approve" ? "Sua identidade foi verificada" : "Falta um ajuste na sua verificação",
          message: body.decision === "approve" ? "Tudo certo: você já pode sacar o seu saldo." : `Para concluir a verificação, precisamos de um ajuste: ${body.note}\n\nÉ só enviar de novo pelo painel.`,
          link: `${deps.config.webUrl}/painel/${body.decision === "approve" ? "financeiro" : "verificacao"}`,
          link_label: body.decision === "approve" ? "Abrir o Financeiro" : "Enviar de novo",
        });
        await audit(tx, { auth, actorKind: "backoffice", accountId: account.id, action: `account.kyc.${body.decision}`, data: { note: body.note } });
        return { id: account.id, kyc_status: status };
      }),
  );

  r.get("/v1/backoffice/accounts/:id/kyc-documents", { access: "backoffice", tag: "Backoffice", summary: "Documento e selfie enviados para a verificação (endereços que vencem em 5 minutos)", hidden: true }, async ({ params, db, auth }) =>
    db(async (tx) => {
      const [sub] = await tx`select * from kyc_submissions where account_id = ${uuidOr404(params.id!)} order by created_at desc limit 1`;
      if (!sub) throw notFound("Documentos");
      const [account] = await tx`select document_enc from accounts where id = ${sub.account_id}`;
      const ids = [sub.document_front_file_id, sub.document_back_file_id, sub.selfie_file_id].filter(Boolean);
      const files = await tx`select id, storage_key, purpose, content_type from files where id in ${tx(ids)} and status = 'ready'`;
      const view = (id: string | null) => {
        const f = files.find((x) => x.id === id);
        return f ? { url: signedUrl(deps, f as never), content_type: f.content_type } : null;
      };
      // Abrir os documentos de alguém fica registrado.
      await audit(tx, { auth, actorKind: "backoffice", accountId: sub.account_id, action: "account.kyc_documents_viewed", target: sub.id });
      return {
        status: sub.status,
        sent_at: sub.created_at,
        document_number: account?.document_enc ? decryptField(account.document_enc, deps.config.fieldEncryptionKey) : null,
        document_front: view(sub.document_front_file_id),
        document_back: view(sub.document_back_file_id),
        selfie: view(sub.selfie_file_id),
      };
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

  // ── B04 · Risco e chargebacks

  r.get("/v1/backoffice/risk", { access: "backoffice", tag: "Backoffice", summary: "Fila de contestações, indicadores e contas fora do padrão", hidden: true }, async ({ db }) =>
    db(async (tx) => {
      const chargebacks = await tx`
        select c.id, c.status, c.reason, c.amount_cents, c.due_at, c.evidence, c.evidence_at, c.defense_sent_at, c.resolved_at, c.created_at,
               c.account_id, a.name as seller_name, o.id as order_id, o.number as order_number, o.method, o.paid_at, p.name as product_name,
               u.name as buyer_name, u.email as buyer_email
        from chargebacks c join accounts a on a.id = c.account_id join orders o on o.id = c.order_id
        join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id
        order by (c.status in ('open', 'defended')) desc, c.due_at limit 100`;
      const [month] = await tx`
        select count(*) filter (where status = 'chargeback') as chargebacks, count(*) filter (where status = 'refunded') as refunded,
               count(*) filter (where status in ('paid', 'refunded', 'chargeback')) as approved
        from orders where env = 'live' and created_at >= date_trunc('month', now())`;
      const [open] = await tx`
        select count(*) as total, coalesce(sum(amount_cents), 0) as amount_cents, count(*) filter (where status = 'open' and due_at < now() + interval '2 days') as due_soon
        from chargebacks where status in ('open', 'defended')`;
      // Fora do padrão: pelo menos 5 vendas em 30 dias e reembolso acima de 10% ou contestação acima de 1%.
      const outliers = await tx`
        select * from (
          select a.id, a.name, a.withdrawals_blocked_reason,
                 count(*) filter (where o.status in ('paid', 'refunded', 'chargeback')) as approved,
                 count(*) filter (where o.status = 'refunded') as refunded,
                 count(*) filter (where o.status = 'chargeback') as chargebacks,
                 coalesce(sum(o.gross_cents) filter (where o.status = 'paid'), 0) as sold_cents
          from accounts a join orders o on o.account_id = a.id and o.env = 'live' and o.created_at > now() - interval '30 days'
          group by a.id
        ) t
        where approved >= 5 and (refunded * 10 > approved or chargebacks * 100 > approved)
        order by chargebacks desc, refunded desc limit 30`;
      const sandbox = deps.provider.name === "sandbox" && deps.config.env !== "production";
      return {
        chargebacks,
        indicators: {
          chargeback_rate_bps: month!.approved ? Math.round((month!.chargebacks * 10000) / month!.approved) : 0,
          refund_rate_bps: month!.approved ? Math.round((month!.refunded * 10000) / month!.approved) : 0,
          open_count: open!.total,
          open_amount_cents: open!.amount_cents,
          due_soon: open!.due_soon,
        },
        outliers,
        sandbox,
        // Só com o provedor de testes: vendas recentes para simular uma contestação.
        recent_paid: sandbox
          ? await tx`
              select o.id, o.number, o.buyer_total_cents, p.name as product_name, a.name as seller_name
              from orders o join products p on p.id = o.product_id join accounts a on a.id = o.account_id
              where o.status = 'paid' order by o.paid_at desc limit 8`
          : [],
      };
    }),
  );

  r.post(
    "/v1/backoffice/chargebacks/:id/defense",
    { access: "backoffice", tag: "Backoffice", summary: "Registrar que a defesa foi enviada à adquirente", hidden: true },
    async ({ params, db, auth }) =>
      db(async (tx) => {
        const [cb] = await tx`
          update chargebacks set status = 'defended', defense_sent_at = now() where id = ${uuidOr404(params.id!)} and status = 'open' returning id, account_id, evidence`;
        if (!cb) throw notFound("Contestação aguardando defesa");
        await audit(tx, { auth, actorKind: "backoffice", accountId: cb.account_id, action: "chargeback.defense_sent", target: cb.id, data: { with_evidence: Boolean(cb.evidence) } });
        return { id: cb.id, status: "defended" };
      }),
  );

  r.post(
    "/v1/backoffice/chargebacks/:id/result",
    { access: "backoffice", tag: "Backoffice", summary: "Registrar o resultado da contestação (ganhou ou perdeu)", hidden: true, body: z.object({ result: z.enum(["won", "lost"]) }) },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const res = await resolveChargeback(tx, uuidOr404(params.id!), body.result);
        await audit(tx, { auth, actorKind: "backoffice", accountId: res.account_id, action: `chargeback.${body.result}`, target: res.id });
        return { id: res.id, status: res.status };
      }),
  );

  r.post(
    "/v1/backoffice/sandbox/orders/:id/chargeback",
    {
      access: "backoffice",
      tag: "Backoffice",
      summary: "Simular uma contestação (só com o provedor de testes)",
      hidden: true,
      body: z.object({ reason: z.string().trim().min(3).max(200).default("Compra não reconhecida") }),
    },
    async ({ params, body, db }) => {
      if (deps.provider.name !== "sandbox" || deps.config.env === "production") throw notFound("Rota");
      const payment = await db(async (tx) => {
        const [row] = await tx`select p.provider_ref, o.status from payments p join orders o on o.id = p.order_id where p.order_id = ${uuidOr404(params.id!)} and p.status = 'confirmed'`;
        return row;
      });
      if (!payment || payment.status !== "paid") throw unprocessable("order_not_paid", "Só dá para contestar uma venda paga.");
      await handleProviderEvent(deps, { type: "payment.chargeback", providerRef: payment.provider_ref, reason: body.reason, dueAt: new Date(deps.now().getTime() + 7 * 86_400_000) });
      return { ok: true };
    },
  );

  // ── B03 e B05 · Alterações com dupla aprovação: um operador pede, outro aprova.

  const methodFee = z.object({ percentBps: z.number().int().min(0).max(2000), fixedCents: z.number().int().min(0).max(2000) }).partial();
  const feeChange = z.object({ pix: methodFee, card: methodFee, boleto: methodFee, installmentInterestBpsMonthly: z.number().int().min(0).max(1000), maxInstallments: z.number().int().min(1).max(12) }).partial();
  const days = z.number().int().min(0).max(180);
  const conditionsPayload = z.object({
    // null tira a condição própria e a conta volta para a regra geral.
    fee_override: feeChange.nullable().optional(),
    release_override: z.object({ pixReleaseDays: days, cardReleaseDays: days, boletoReleaseDays: days, reserveBps: z.number().int().min(0).max(5000), reserveDays: days }).partial().nullable().optional(),
    withdrawal_daily_limit_cents: z.number().int().min(100).nullable().optional(),
  });
  const settingsPayload = z.object({
    fees: feeChange.optional(),
    release: z
      .object({
        newAccountDays: days, trustedAccountDays: days.max(720), newAccountReleaseDays: days, pixReleaseDays: days, cardReleaseDays: days,
        reserveBps: z.number().int().min(0).max(5000), reserveDays: days, trustedMaxRefundBps: z.number().int().min(0).max(10000), trustedMaxChargebackBps: z.number().int().min(0).max(10000),
      })
      .partial()
      .optional(),
    pixKeyChangeBlockHours: z.number().int().min(0).max(168).optional(),
    pixExpiresMinutes: z.number().int().min(5).max(1440).optional(),
    prohibitedCategories: z.array(z.string().trim().min(2).max(80)).max(40).optional(),
  });

  r.post(
    "/v1/backoffice/changes",
    {
      access: "backoffice",
      tag: "Backoffice",
      summary: "Pedir uma alteração de condições de conta ou de configuração (outro operador aprova)",
      hidden: true,
      body: z.object({ kind: z.enum(["account_conditions", "platform_settings"]), account_id: z.string().uuid().optional(), payload: z.record(z.string(), z.unknown()), reason: z.string().trim().min(5, "Escreva o motivo").max(1000) }),
    },
    async ({ body, db, auth, userId }) =>
      db(async (tx) => {
        const parsed = (body.kind === "account_conditions" ? conditionsPayload : settingsPayload).safeParse(body.payload);
        if (!parsed.success || Object.keys(parsed.data).length === 0) throw unprocessable("invalid_change", "Confira os valores da alteração.");
        if (body.kind === "account_conditions") {
          if (!body.account_id) throw unprocessable("account_required", "Informe a conta.");
          const [account] = await tx`select id from accounts where id = ${body.account_id}`;
          if (!account) throw notFound("Conta");
        }
        const [row] = await tx`
          insert into pending_changes (kind, account_id, payload, reason, requested_by)
          values (${body.kind}, ${body.kind === "account_conditions" ? body.account_id! : null}, ${tx.json(parsed.data as never)}, ${body.reason}, ${userId})
          returning id, status`;
        await audit(tx, { auth, actorKind: "backoffice", accountId: body.account_id ?? null, action: `change.requested.${body.kind}`, target: row!.id, data: { reason: body.reason, payload: parsed.data } });
        return created(row!);
      }),
  );

  r.get(
    "/v1/backoffice/changes",
    { access: "backoffice", tag: "Backoffice", summary: "Alterações pedidas e decididas", hidden: true, query: z.object({ account_id: z.string().uuid().optional(), kind: z.enum(["account_conditions", "platform_settings"]).optional() }) },
    async ({ query, db, userId }) =>
      db(async (tx) => ({
        data: (
          await tx`
            select c.id, c.kind, c.account_id, a.name as account_name, c.payload, c.reason, c.status, c.created_at, c.decided_at,
                   c.requested_by, ru.name as requested_by_name, du.name as decided_by_name
            from pending_changes c left join accounts a on a.id = c.account_id
            join users ru on ru.id = c.requested_by left join users du on du.id = c.decided_by
            where (${query.account_id ?? null}::uuid is null or c.account_id = ${query.account_id ?? null})
              and (${query.kind ?? null}::text is null or c.kind = ${query.kind ?? null})
            order by (c.status = 'pending') desc, c.created_at desc limit 50`
        ).map(({ requested_by, ...c }) => ({ ...c, mine: requested_by === userId })),
      })),
  );

  r.post(
    "/v1/backoffice/changes/:id/decision",
    { access: "backoffice", tag: "Backoffice", summary: "Aprovar ou recusar uma alteração pedida por outro operador", hidden: true, body: z.object({ approve: z.boolean() }) },
    async ({ params, body, db, auth, userId }) =>
      db(async (tx) => {
        const [change] = await tx`select * from pending_changes where id = ${uuidOr404(params.id!)} for update`;
        if (!change) throw notFound("Alteração");
        if (change.status !== "pending") throw unprocessable("already_decided", "Esta alteração já foi decidida.");
        if (body.approve && change.requested_by === userId)
          throw forbidden("Quem pediu a alteração não pode aprovar. Peça para outra pessoa da equipe conferir.");
        if (body.approve) {
          const payload = change.payload as Record<string, any>;
          if (change.kind === "account_conditions") {
            const [account] = await tx`select fee_override, release_override, withdrawal_daily_limit_cents from accounts where id = ${change.account_id} for update`;
            const next = {
              fee_override: "fee_override" in payload ? payload.fee_override : account!.fee_override,
              release_override: "release_override" in payload ? payload.release_override : account!.release_override,
              limit: "withdrawal_daily_limit_cents" in payload ? payload.withdrawal_daily_limit_cents : account!.withdrawal_daily_limit_cents,
            };
            await tx`
              update accounts set fee_override = ${next.fee_override ? tx.json(next.fee_override) : null},
                release_override = ${next.release_override ? tx.json(next.release_override) : null},
                withdrawal_daily_limit_cents = ${next.limit ?? null}
              where id = ${change.account_id}`;
          } else {
            // Cada publicação vira uma nova versão; as anteriores ficam guardadas.
            const current = await getPlatformSettings(tx);
            const { version: _v, ...data } = current;
            const merged = { ...data, ...payload, fees: resolveFeeTable(current.fees, payload.fees), release: { ...current.release, ...payload.release } };
            await tx`insert into platform_settings (data, published_by, approved_by, published_at) values (${tx.json(merged as never)}, ${change.requested_by}, ${userId}, now())`;
          }
        }
        const status = body.approve ? "approved" : "rejected";
        await tx`update pending_changes set status = ${status}, decided_by = ${userId}, decided_at = now() where id = ${change.id}`;
        await audit(tx, { auth, actorKind: "backoffice", accountId: change.account_id, action: `change.${status}.${change.kind}`, target: change.id, data: { reason: change.reason } });
        return { id: change.id, status };
      }),
  );

  // ── E-mails: como está a entrega, endereços bloqueados e envio de teste

  r.get("/v1/backoffice/emails", { access: "backoffice", tag: "Backoffice", summary: "Situação do envio de e-mails", hidden: true }, async ({ db }) =>
    db(async (tx) => {
      const [counts] = await tx`
        select count(*) filter (where status = 'sent' and sent_at > now() - interval '24 hours') as sent_24h,
               count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours') as failed_24h,
               count(*) filter (where status = 'pending') as pending,
               count(*) filter (where status = 'suppressed' and created_at > now() - interval '24 hours') as suppressed_24h
        from outbox_messages where channel = 'email'`;
      return {
        // Sem chave do Resend, nada é enviado de verdade: as mensagens só aparecem no log do servidor.
        provider: deps.config.resendApiKey ? "resend" : "log",
        from: deps.config.emailFrom,
        bounce_tracking: Boolean(deps.config.resendWebhookSecret),
        webhook_url: `${deps.config.apiUrl}/v1/email-webhooks/resend`,
        codes_on_screen: deps.config.env !== "production",
        counts,
        problems: await tx`
          select id, recipient, template, status, attempts, last_error, created_at from outbox_messages
          where channel = 'email' and (status in ('failed', 'suppressed') or (status = 'pending' and attempts > 0))
          order by created_at desc limit 30`,
        suppressions: await tx`select email, reason, detail, created_at from email_suppressions order by created_at desc limit 50`,
      };
    }),
  );

  r.post("/v1/backoffice/emails/test", { access: "backoffice", tag: "Backoffice", summary: "Enviar um e-mail de teste para o próprio endereço", hidden: true }, async ({ db, auth }) =>
    db(async (tx) => {
      if (auth?.kind !== "session") throw forbidden();
      await enqueueEmail(tx, auth.user.email, "test", {});
      await audit(tx, { auth, actorKind: "backoffice", action: "email.test_sent" });
      return { ok: true, to: auth.user.email };
    }),
  );

  r.post(
    "/v1/backoffice/emails/unblock",
    { access: "backoffice", tag: "Backoffice", summary: "Tirar um endereço da lista de bloqueio", hidden: true, body: z.object({ email: z.string().trim().toLowerCase().min(3).max(320) }) },
    async ({ body, db, auth }) =>
      db(async (tx) => {
        const [row] = await tx`delete from email_suppressions where email = ${body.email} returning email`;
        if (!row) throw notFound("Endereço");
        await audit(tx, { auth, actorKind: "backoffice", action: "email.unblocked", data: { email: body.email } });
        return { ok: true };
      }),
  );

  r.get("/v1/backoffice/settings", { access: "backoffice", tag: "Backoffice", summary: "Configurações da plataforma em vigor e versões anteriores", hidden: true }, async ({ db }) =>
    db(async (tx) => ({
      ...(await getPlatformSettings(tx)),
      versions: await tx`
        select s.version, s.published_at, pu.name as published_by_name, au.name as approved_by_name
        from platform_settings s left join users pu on pu.id = s.published_by left join users au on au.id = s.approved_by
        where s.published_at is not null order by s.version desc limit 20`,
    })),
  );
}
