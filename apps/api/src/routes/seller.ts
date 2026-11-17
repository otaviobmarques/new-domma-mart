import { API_SCOPES, WEBHOOK_EVENTS, classifyIdentifier, formatBRL, formatBps, isValidDocument, isValidEmail, isValidPhone, onlyDigits } from "@domma/core";
import { decryptField, encryptField, hashToken, randomToken } from "@domma/core/server";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { notFound, unprocessable } from "../lib/errors.ts";
import { ROLES_ADMIN, ROLES_FINANCE, ROLES_SALES, type Router, created } from "../lib/router.ts";
import { audit } from "../services/audit.ts";
import { createMagicLink, identifierHash } from "../services/auth.ts";
import { getWallet } from "../services/ledger.ts";
import { enqueueEmail } from "../services/notify.ts";
import { accountFeeTable, accountReleasePolicy, executeRefund, maskPixKey, orderJson, requestWithdrawal } from "../services/sales.ts";
import { getPlatformSettings } from "../services/settings.ts";
import { validateWebhookUrl } from "../services/webhooks.ts";
import { requireConfirmation } from "./auth.ts";

const TZ = "America/Sao_Paulo";
const PERIODS = { today: 0, "7d": 6, "30d": 29 } as const;

export function sellerRoutes(r: Router, deps: Deps) {
  const { config } = deps;

  // ── Início (P03)

  r.get("/v1/dashboard", { access: "account", tag: "Vendas", summary: "Resumo: vendido hoje, no mês, saldo e últimas vendas" }, async ({ db, auth, accountId }) =>
    db(async (tx) => {
      const [totals] = await tx`
        select
          coalesce(sum(gross_cents) filter (where paid_at >= date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}), 0) as today_cents,
          count(*) filter (where paid_at >= date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}) as today_count,
          coalesce(sum(gross_cents) filter (where paid_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}), 0) as month_cents,
          count(*) filter (where paid_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}) as month_count,
          count(*) as all_count
        from orders where status = 'paid' and env = 'live'`;
      const chart = await tx`
        select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(sum(o.gross_cents), 0) as total_cents
        from generate_series((now() at time zone ${TZ})::date - 29, (now() at time zone ${TZ})::date, interval '1 day') as d(day)
        left join orders o on o.status = 'paid' and o.env = 'live' and (o.paid_at at time zone ${TZ})::date = d.day::date
        group by d.day order by d.day`;
      const lastSales = await tx`
        select o.id, o.number, o.status, o.method, o.installments, o.gross_cents, o.origin, o.created_at, p.name as product_name, u.name as buyer_name
        from orders o join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id
        where o.env = 'live' order by o.created_at desc limit 5`;
      const [account] = await tx`select kyc_status, status, created_at from accounts where id = ${accountId}`;
      const [products] = await tx`select count(*) as n from products`;
      const canSeeMoney = auth?.kind === "api_key" || ROLES_FINANCE.includes(auth!.account!.role as never);
      const wallet = canSeeMoney ? await getWallet(tx, accountId) : null;
      return {
        today: { total_cents: totals!.today_cents, count: totals!.today_count },
        month: { total_cents: totals!.month_cents, count: totals!.month_count },
        wallet,
        chart,
        last_sales: lastSales.map((s) => ({ ...s, buyer_name: shortName(s.buyer_name) })),
        kyc_status: account!.kyc_status,
        // Para conta nova: os 3 passos até a primeira venda.
        onboarding: { has_product: products!.n > 0, identity_verified: account!.kyc_status === "approved", has_sale: totals!.all_count > 0 },
      };
    }),
  );

  // ── Vendas (P08)

  r.get(
    "/v1/orders",
    {
      access: "account",
      tag: "Vendas",
      summary: "Listar vendas, com busca e filtros",
      scope: "orders:read",
      query: z.object({
        period: z.enum(["today", "7d", "30d", "all"]).default("30d"),
        status: z.enum(["paid", "pending", "refused", "refunded", "expired", "chargeback"]).optional(),
        product_id: z.uuid().optional(),
        q: z.string().trim().max(120).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.iso.datetime().optional(),
      }),
    },
    async ({ query, db }) =>
      db(async (tx) => {
        const since = query.period === "all" ? null : PERIODS[query.period];
        const id = query.q ? classifyIdentifier(query.q) : null;
        const cpfHash = id?.kind === "cpf" ? identifierHash(config, "cpf", id.value) : null;
        const like = query.q ? `%${query.q.toLowerCase()}%` : null;
        const rows = await tx`
          select o.*, p.name as product_name, u.name as buyer_name, u.email as buyer_email
          from orders o join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id
          where o.env = 'live'
            and (${since}::int is null or o.created_at >= (date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${since ?? 0})) at time zone ${TZ})
            and (${query.status ?? null}::text is null or o.status = ${query.status ?? null})
            and (${query.product_id ?? null}::uuid is null or o.product_id = ${query.product_id ?? null})
            and (${query.before ?? null}::timestamptz is null or o.created_at < ${query.before ?? null})
            and (${like}::text is null or lower(u.name) like ${like} or u.email like ${like} or u.cpf_hash = ${cpfHash})
          order by o.created_at desc limit ${query.limit}`;
        const [funnel] = await tx`
          select count(*) as visits, count(*) filter (where stage <> 'visited') as started,
                 count(*) filter (where stage in ('payment_generated', 'paid')) as payment_generated, count(*) filter (where stage = 'paid') as paid
          from checkout_sessions
          where (${since}::int is null or created_at >= (date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${since ?? 0})) at time zone ${TZ})`;
        return {
          data: rows.map((o) => ({ ...orderJson(o), product_name: o.product_name, customer: { name: o.buyer_name, email: o.buyer_email } })),
          funnel,
        };
      }),
  );

  r.get("/v1/orders/:id", { access: "account", tag: "Vendas", summary: "Detalhe da venda: comprador, itens, valores e linha do tempo", scope: "orders:read" }, async ({ params, db }) =>
    db(async (tx) => {
      const [o] = await tx`
        select o.*, p.name as product_name, u.name as buyer_name, u.email as buyer_email, u.phone as buyer_phone
        from orders o join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id
        where o.id = ${uuidOr404(params.id!)}`;
      if (!o) throw notFound("Venda");
      const items = await tx`select kind, title, price_cents from order_items where order_id = ${o.id} order by kind`;
      const [refund] = await tx`select id, status, kind, reason, created_at from refunds where order_id = ${o.id}`;
      const releases = await tx`select from_kind, amount_cents, release_at, status from scheduled_releases where order_id = ${o.id} order by release_at`;
      const [chargeback] = await tx`select id, status, reason, due_at, evidence, evidence_at, resolved_at, created_at from chargebacks where order_id = ${o.id}`;
      return {
        ...orderJson(o),
        product_name: o.product_name,
        card_last4: o.card_last4,
        fee: o.fee_snapshot,
        customer: { name: o.buyer_name, email: o.buyer_email, phone: o.buyer_phone },
        items,
        refund: refund ?? null,
        releases,
        chargeback: chargeback ?? null,
      };
    }),
  );

  r.post(
    "/v1/orders/:id/chargeback/evidence",
    {
      access: "account",
      tag: "Vendas",
      summary: "Enviar as provas de uma venda contestada (o que comprova a entrega)",
      scope: "orders:write",
      roles: ROLES_SALES,
      body: z.object({ text: z.string().trim().min(20, "Conte com mais detalhes o que comprova a entrega").max(5000) }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const [cb] = await tx`select id, status from chargebacks where order_id = ${uuidOr404(params.id!)} for update`;
        if (!cb) throw notFound("Contestação");
        if (cb.status !== "open") throw unprocessable("defense_already_sent", "A defesa desta contestação já foi enviada ao banco.");
        await tx`update chargebacks set evidence = ${body.text}, evidence_at = now() where id = ${cb.id}`;
        await audit(tx, { auth, action: "chargeback.evidence", target: cb.id });
        return { id: cb.id, status: "open", evidence: body.text };
      }),
  );

  r.post(
    "/v1/orders/:id/refund",
    {
      access: "account",
      tag: "Vendas",
      summary: "Reembolsar a venda (total). Estorna taxa e saldo automaticamente.",
      scope: "orders:write",
      roles: ROLES_SALES,
      idempotent: true,
      body: z.object({ reason: z.string().trim().max(500).optional() }),
    },
    async ({ params, body, accountId, userId, auth, system }) => {
      const refundId = await executeRefund(deps, { orderId: uuidOr404(params.id!), kind: "producer_initiated", reason: body.reason, requestedBy: userId, accountId });
      await system((tx) => audit(tx, { auth, action: "order.refunded", target: params.id, data: { refund_id: refundId } }));
      return { refund_id: refundId, status: "approved" };
    },
  );

  r.post(
    "/v1/orders/:id/refund/deny",
    {
      access: "account",
      tag: "Vendas",
      summary: "Recusar um pedido de reembolso feito fora da garantia",
      scope: "orders:write",
      roles: ROLES_SALES,
      body: z.object({ reason: z.string().trim().min(3).max(500) }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const [refund] = await tx`update refunds set status = 'denied' where order_id = ${uuidOr404(params.id!)} and status = 'requested' returning id, account_id`;
        if (!refund) throw notFound("Pedido de reembolso");
        await tx`insert into refund_events (account_id, refund_id, step, message) values (${refund.account_id}, ${refund.id}, 'denied', ${`O produtor não aprovou o reembolso: ${body.reason}`})`;
        await audit(tx, { auth, action: "refund.denied", target: refund.id });
        return { ok: true };
      }),
  );

  r.post(
    "/v1/orders/:id/resend-access",
    { access: "account", tag: "Vendas", summary: "Reenviar o link de acesso ao comprador", scope: "orders:write", roles: ROLES_SALES },
    async ({ params, db, system }) => {
      const order = await db(async (tx) => {
        const [o] = await tx`
          select o.id, o.status, o.product_id, o.buyer_user_id, p.name as product_name, u.name as buyer_name, u.email
          from orders o join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id where o.id = ${uuidOr404(params.id!)}`;
        return o;
      });
      if (!order) throw notFound("Venda");
      if (order.status !== "paid") throw unprocessable("order_not_paid", "Só dá para reenviar o acesso de uma venda aprovada.");
      await system(async (tx) => {
        const link = await createMagicLink(tx, config, { userId: order.buyer_user_id, redirectTo: `/assistir/${order.product_id}`, ttlMinutes: 7 * 24 * 60 });
        await enqueueEmail(tx, order.email, "access_granted", { name: shortName(order.buyer_name), product: order.product_name, link });
      });
      return { ok: true };
    },
  );

  // ── Financeiro (P09)

  r.get(
    "/v1/balance",
    { access: "account", tag: "Financeiro", summary: "Saldo: disponível, a liberar (com datas) e reservado", scope: "balance:read", roles: ROLES_FINANCE },
    async ({ db, accountId }) =>
      db(async (tx) => {
        const wallet = await getWallet(tx, accountId);
        const upcoming = await tx`
          select (release_at at time zone ${TZ})::date as day, from_kind, sum(amount_cents) as amount_cents
          from scheduled_releases where status = 'scheduled' group by 1, 2 order by 1 limit 60`;
        const fees = await accountFeeTable(tx, accountId);
        const policy = await accountReleasePolicy(tx, accountId, deps.now());
        const [account] = await tx`select kyc_status, pix_key_enc, pix_key_changed_at, withdrawals_blocked_reason from accounts where id = ${accountId}`;
        return {
          ...wallet,
          upcoming_releases: upcoming,
          kyc_status: account!.kyc_status,
          pix_key_masked: account!.pix_key_enc ? maskPixKey(decryptField(account!.pix_key_enc, config.fieldEncryptionKey)) : null,
          withdrawals_blocked_reason: account!.withdrawals_blocked_reason,
          // Tabela que vale para a conta, em linguagem simples.
          fees: {
            table: fees,
            plain: [
              { label: "Pix", value: `${formatBRL(fees.pix.fixedCents)} por venda` },
              { label: "Cartão de crédito", value: `${formatBps(fees.card.percentBps)} + ${formatBRL(fees.card.fixedCents)} por venda` },
              { label: "Saque", value: "Grátis" },
              { label: "Parcelamento", value: `${formatBps(fees.installmentInterestBpsMonthly)} ao mês, pagos pelo comprador (você pode assumir)` },
            ],
          },
          release: {
            policy,
            plain: [
              { label: "Pix", value: policy.pixReleaseDays === 1 ? "Liberado no dia seguinte" : `Liberado em ${policy.pixReleaseDays} dias` },
              { label: "Cartão", value: `Liberado em ${policy.cardReleaseDays} dias` },
              {
                label: "Reserva de segurança",
                value: policy.reserveBps ? `${formatBps(policy.reserveBps)} de cada venda, devolvidos em ${policy.reserveDays} dias` : "Sem reserva",
              },
            ],
          },
        };
      }),
  );

  r.get(
    "/v1/transactions",
    {
      access: "account",
      tag: "Financeiro",
      summary: "Extrato: cada linha ligada à venda que a originou",
      scope: "balance:read",
      roles: ROLES_FINANCE,
      query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), before: z.iso.datetime().optional() }),
    },
    async ({ query, db }) =>
      db(async (tx) => ({
        // Liberações internas (a liberar -> disponível) somam zero para a conta e não aparecem.
        data: await tx`
          select t.id, t.kind, t.description, t.order_id, t.withdrawal_id, t.created_at, sum(e.amount_cents) as amount_cents, o.method, o.gross_cents, o.fee_cents
          from ledger_transactions t join ledger_entries e on e.transaction_id = t.id
          left join orders o on o.id = t.order_id
          where e.account_id is not null and (${query.before ?? null}::timestamptz is null or t.created_at < ${query.before ?? null})
          group by t.id, o.method, o.gross_cents, o.fee_cents
          having sum(e.amount_cents) <> 0
          order by t.created_at desc limit ${query.limit}`,
      })),
  );

  r.get("/v1/withdrawals", { access: "account", tag: "Financeiro", summary: "Histórico de saques", scope: "balance:read", roles: ROLES_FINANCE }, async ({ db }) => ({
    data: await db((tx) => tx`select id, amount_cents, status, pix_key_masked, failure_reason, created_at, completed_at from withdrawals order by created_at desc limit 100`),
  }));

  r.post(
    "/v1/withdrawals",
    {
      access: "account",
      tag: "Financeiro",
      summary: "Sacar para a chave Pix do titular (exige o código de confirmação)",
      roles: ROLES_FINANCE,
      idempotent: true,
      body: z.object({ amount_cents: z.number().int().min(100), confirmation_code: z.string().regex(/^\d{6}$/) }),
    },
    async (args) => {
      await requireConfirmation(deps, args, "withdrawal", args.body.confirmation_code);
      const w = await requestWithdrawal(deps, { accountId: args.accountId, amountCents: args.body.amount_cents, userId: args.userId });
      await args.system((tx) => audit(tx, { auth: args.auth, action: "withdrawal.requested", target: w.id, data: { amount_cents: w.amount_cents } }));
      return created({ id: w.id, amount_cents: w.amount_cents, status: w.status, pix_key_masked: w.pix_key_masked, created_at: w.created_at });
    },
  );

  // ── Verificação de identidade (P02) e chave Pix

  const pixKey = z
    .string()
    .trim()
    .min(5)
    .max(100)
    .refine((v) => isValidEmail(v) || isValidDocument(v) || isValidPhone(v) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), "Chave Pix inválida");
  const normalizePixKey = (v: string) => (v.includes("@") ? v.toLowerCase() : /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : onlyDigits(v));

  r.get("/v1/account", { access: "account", tag: "Conta", summary: "Dados da conta e situação da verificação" }, async ({ db, accountId }) =>
    db(async (tx) => {
      const [a] = await tx`select id, name, status, block_reason, kyc_status, kyc_note, document_enc, pix_key_enc, pix_key_changed_at, created_at from accounts where id = ${accountId}`;
      const doc = a!.document_enc ? decryptField(a!.document_enc, config.fieldEncryptionKey) : null;
      return {
        id: a!.id,
        name: a!.name,
        status: a!.status,
        block_reason: a!.block_reason,
        kyc_status: a!.kyc_status,
        kyc_note: a!.kyc_note,
        // Se a verificação pede foto do documento e selfie (em testes automáticos, não).
        kyc_requires_documents: config.kycReview === "manual",
        document_masked: doc ? `•••${doc.slice(-4)}` : null,
        pix_key_masked: a!.pix_key_enc ? maskPixKey(decryptField(a!.pix_key_enc, config.fieldEncryptionKey)) : null,
        pix_key_changed_at: a!.pix_key_changed_at,
        created_at: a!.created_at,
      };
    }),
  );

  r.post(
    "/v1/account/verification",
    {
      access: "account",
      tag: "Conta",
      summary: "Enviar os dados para a verificação de identidade (exigida antes do primeiro saque)",
      roles: ROLES_ADMIN,
      body: z.object({
        document: z.string().refine(isValidDocument, "CPF ou CNPJ inválido"),
        pix_key: pixKey,
        // Fotos enviadas antes por /v1/files: documento (frente e, se houver, verso) e selfie.
        document_front_file_id: z.uuid().optional(),
        document_back_file_id: z.uuid().optional(),
        selfie_file_id: z.uuid().optional(),
      }),
    },
    async ({ body, db, auth, accountId, userId }) =>
      db(async (tx) => {
        const [account] = await tx`select kyc_status from accounts where id = ${accountId} for update`;
        if (account!.kyc_status === "in_review") throw unprocessable("already_in_review", "Sua verificação já está em análise.");
        if (account!.kyc_status === "approved") throw unprocessable("already_verified", "Sua identidade já foi verificada.");
        const document = onlyDigits(body.document);
        // Uma pessoa do backoffice confere o documento e a selfie. Só em testes a aprovação é automática.
        const manual = config.kycReview === "manual";
        const status = manual ? "in_review" : "approved";
        if (manual) {
          if (!body.document_front_file_id || !body.selfie_file_id) throw unprocessable("documents_required", "Envie a foto do documento e a selfie para continuar.");
          const check = async (id: string | undefined, purpose: string) => {
            if (!id) return;
            const [file] = await tx`select id from files where id = ${id} and purpose = ${purpose} and status = 'ready'`;
            if (!file) throw unprocessable("file_not_ready", "Uma das fotos não chegou direito. Envie de novo.");
          };
          await check(body.document_front_file_id, "kyc_document");
          await check(body.document_back_file_id, "kyc_document");
          await check(body.selfie_file_id, "kyc_selfie");
          await tx`
            insert into kyc_submissions (account_id, document_front_file_id, document_back_file_id, selfie_file_id, submitted_by)
            values (${accountId}, ${body.document_front_file_id}, ${body.document_back_file_id ?? null}, ${body.selfie_file_id}, ${userId})`;
        }
        await tx`
          update accounts set kyc_status = ${status}, kyc_note = null,
            document_enc = ${encryptField(document, config.fieldEncryptionKey)}, document_hash = ${identifierHash(config, "cpf", document)},
            pix_key_enc = ${encryptField(normalizePixKey(body.pix_key), config.fieldEncryptionKey)}
          where id = ${accountId}`;
        await audit(tx, { auth, action: "account.verification_submitted", data: { status } });
        return { kyc_status: status };
      }),
  );

  r.put(
    "/v1/account/pix-key",
    {
      access: "account",
      tag: "Conta",
      summary: "Trocar a chave Pix de saque (exige código; pausa os saques por 24 horas)",
      roles: ROLES_ADMIN,
      body: z.object({ pix_key: pixKey, confirmation_code: z.string().regex(/^\d{6}$/) }),
    },
    async (args) => {
      await requireConfirmation(deps, args, "pix_key", args.body.confirmation_code);
      return args.system(async (tx) => {
        const settings = await getPlatformSettings(tx);
        const [account] = await tx`
          update accounts set pix_key_enc = ${encryptField(normalizePixKey(args.body.pix_key), config.fieldEncryptionKey)}, pix_key_changed_at = now()
          where id = ${args.accountId} and kyc_status = 'approved' returning owner_user_id`;
        if (!account) throw unprocessable("identity_required", "Conclua a verificação de identidade antes de trocar a chave Pix.");
        const [owner] = await tx`select email from users where id = ${account.owner_user_id}`;
        await enqueueEmail(tx, owner!.email, "pix_key_changed", { hours: settings.pixKeyChangeBlockHours });
        await audit(tx, { auth: args.auth, action: "account.pix_key_changed" });
        return { ok: true, withdrawals_paused_hours: settings.pixKeyChangeBlockHours };
      });
    },
  );

  // ── Chaves de API e webhooks (P11)

  r.get("/v1/api-keys", { access: "account", tag: "Integrações", summary: "Listar chaves de API", roles: ROLES_ADMIN }, async ({ db }) => ({
    data: await db((tx) => tx`select id, name, env, prefix, scopes, last_used_at, created_at from api_keys where revoked_at is null order by created_at desc`),
  }));

  r.post(
    "/v1/api-keys",
    {
      access: "account",
      tag: "Integrações",
      summary: "Criar chave de API. A chave completa aparece uma única vez.",
      roles: ROLES_ADMIN,
      body: z.object({
        name: z.string().trim().min(2).max(60),
        env: z.enum(["live", "test"]).default("live"),
        scopes: z.array(z.enum(API_SCOPES)).min(1),
        confirmation_code: z.string().regex(/^\d{6}$/),
      }),
    },
    async (args) => {
      await requireConfirmation(deps, args, "api_key", args.body.confirmation_code);
      const key = `dm_${args.body.env}_${randomToken(24)}`;
      const row = await args.db(async (tx) => {
        const [inserted] = await tx`
          insert into api_keys (account_id, name, env, prefix, key_hash, scopes, created_by)
          values (${args.accountId}, ${args.body.name}, ${args.body.env}, ${`${key.slice(0, 8)}••••${key.slice(-4)}`}, ${hashToken(key)}, ${args.body.scopes}, ${args.userId})
          returning id, name, env, prefix, scopes, created_at`;
        await audit(tx, { auth: args.auth, action: "api_key.created", target: inserted!.id, data: { scopes: args.body.scopes } });
        return inserted;
      });
      return created({ ...row, key });
    },
  );

  r.delete("/v1/api-keys/:id", { access: "account", tag: "Integrações", summary: "Revogar chave de API", roles: ROLES_ADMIN }, async ({ params, db, auth }) =>
    db(async (tx) => {
      await tx`update api_keys set revoked_at = now() where id = ${uuidOr404(params.id!)} and revoked_at is null`;
      await audit(tx, { auth, action: "api_key.revoked", target: params.id });
      return { ok: true };
    }),
  );

  r.get("/v1/webhooks", { access: "account", tag: "Integrações", summary: "Listar webhooks", scope: "webhooks:write", roles: ROLES_ADMIN }, async ({ db }) => ({
    data: await db((tx) => tx`
      select e.id, e.url, e.events, e.active, e.created_at,
        (select jsonb_build_object('status', d.status, 'attempts', d.attempts, 'at', d.created_at)
         from webhook_deliveries d where d.endpoint_id = e.id order by d.created_at desc limit 1) as last_delivery
      from webhook_endpoints e order by e.created_at desc`),
    events: WEBHOOK_EVENTS,
  }));

  r.post(
    "/v1/webhooks",
    {
      access: "account",
      tag: "Integrações",
      summary: "Cadastrar webhook. O segredo para validar a assinatura aparece uma única vez.",
      scope: "webhooks:write",
      roles: ROLES_ADMIN,
      body: z.object({ url: z.string().trim().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).default([]) }),
    },
    async ({ body, db, accountId, auth }) => {
      const problem = validateWebhookUrl(body.url, config.env === "production");
      if (problem) throw unprocessable("invalid_url", problem);
      const secret = `whsec_${randomToken(24)}`;
      const row = await db(async (tx) => {
        const [count] = await tx`select count(*) as n from webhook_endpoints`;
        if (count!.n >= 20) throw unprocessable("too_many_webhooks", "Cada conta pode ter até 20 webhooks.");
        const [inserted] = await tx`
          insert into webhook_endpoints (account_id, url, secret, events) values (${accountId}, ${body.url}, ${secret}, ${body.events})
          returning id, url, events, active, created_at`;
        await audit(tx, { auth, action: "webhook.created", target: inserted!.id });
        return inserted;
      });
      return created({ ...row, secret });
    },
  );

  r.delete("/v1/webhooks/:id", { access: "account", tag: "Integrações", summary: "Remover webhook", scope: "webhooks:write", roles: ROLES_ADMIN }, async ({ params, db }) => {
    await db((tx) => tx`delete from webhook_endpoints where id = ${uuidOr404(params.id!)}`);
    return { ok: true };
  });

  r.get("/v1/webhooks/:id/deliveries", { access: "account", tag: "Integrações", summary: "Histórico de entregas de um webhook", scope: "webhooks:write", roles: ROLES_ADMIN }, async ({ params, db }) => ({
    data: await db((tx) => tx`
      select id, event, status, attempts, last_status_code, last_error, next_attempt_at, delivered_at, created_at
      from webhook_deliveries where endpoint_id = ${uuidOr404(params.id!)} order by created_at desc limit 100`),
  }));

  r.post(
    "/v1/webhook-deliveries/:id/resend",
    { access: "account", tag: "Integrações", summary: "Reenviar uma entrega", scope: "webhooks:write", roles: ROLES_ADMIN },
    async ({ params, db }) => {
      const rows = await db((tx) => tx`update webhook_deliveries set status = 'pending', next_attempt_at = now(), attempts = 0 where id = ${uuidOr404(params.id!)} returning id`);
      if (!rows.length) throw notFound("Entrega");
      return { ok: true };
    },
  );
}

export function shortName(name: string): string {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0]!.toUpperCase()}.` : first;
}

export function uuidOr404(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw notFound("Registro");
  return id;
}
