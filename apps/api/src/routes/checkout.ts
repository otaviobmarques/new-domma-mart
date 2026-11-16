import {
  CARD_REFUSAL_MESSAGES,
  type FeeTable,
  type InterestPayer,
  computeSale,
  formatBRL,
  formatPhone,
  installmentOptions,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  onlyDigits,
  percentOf,
  resolveCheckoutConfig,
} from "@domma/core";
import { SandboxProvider, encryptField, hashToken, randomToken, safeEqual } from "@domma/core/server";
import { type Tx, withContext } from "@domma/db";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { ApiError, badRequest, forbidden, notFound, unprocessable } from "../lib/errors.ts";
import type { RateLimiter } from "../lib/rate-limit.ts";
import type { Router } from "../lib/router.ts";
import { createSession, identifierHash } from "../services/auth.ts";
import { accountFeeTable, handleProviderEvent, orderJson, settleOrderPaid } from "../services/sales.ts";
import { getPlatformSettings } from "../services/settings.ts";
import { emitEvent } from "../services/webhooks.ts";

const UNAVAILABLE = "Este produto não está à venda no momento.";

async function loadOffer(tx: Tx, slug: string) {
  const [row] = await tx`
    select o.*, p.name as product_name, p.description as product_description, p.cover_url, p.guarantee_days, p.type as product_type,
           p.status as product_status, p.support_contact, a.name as seller_name, a.status as account_status, a.kyc_status
    from offers o join products p on p.id = o.product_id join accounts a on a.id = o.account_id
    where o.slug = ${slug}`;
  if (!row || !row.active || row.product_status !== "approved" || row.account_status !== "active") throw new ApiError(404, "offer_unavailable", UNAVAILABLE);
  return row;
}

async function loadBumps(tx: Tx, offerId: string) {
  return tx`
    select b.id, b.title, b.description, o.id as offer_id, o.product_id, o.price_cents, p.name as product_name
    from order_bumps b join offers o on o.id = b.bump_offer_id join products p on p.id = o.product_id
    where b.offer_id = ${offerId} and b.active and o.active and p.status = 'approved'
    order by b.position limit 3`;
}

async function couponDiscount(tx: Tx, offer: Record<string, any>, code: string | undefined, itemsCents: number, now: Date) {
  if (!code) return { coupon: null, discountCents: 0 };
  const [coupon] = await tx`
    select * from coupons where account_id = ${offer.account_id} and code = ${code.trim().toUpperCase()} and active
      and (product_id is null or product_id = ${offer.product_id})`;
  if (!coupon || (coupon.expires_at && coupon.expires_at < now) || (coupon.max_uses != null && coupon.used_count >= coupon.max_uses))
    throw unprocessable("invalid_coupon", "Este cupom não vale para esta compra.");
  const raw = coupon.kind === "percent" ? percentOf(itemsCents, coupon.value * 100) : coupon.value;
  // O pedido nunca fica abaixo de R$ 1,00.
  return { coupon, discountCents: Math.max(0, Math.min(raw, itemsCents - 100)) };
}

function installmentsFor(priceCents: number, fees: FeeTable, offer: Record<string, any>) {
  return installmentOptions(priceCents, fees, { max: offer.max_installments, interestPayer: offer.interest_payer as InterestPayer }).map((o) => ({
    installments: o.installments,
    installment_cents: o.installmentCents,
    total_cents: o.totalCents,
  }));
}

const buyerSchema = z.object({
  name: z.string().trim().min(3, "Digite o nome completo").max(120),
  email: z.string().trim().max(254).refine(isValidEmail, "E-mail inválido"),
  phone: z.string().refine(isValidPhone, "Celular inválido"),
  cpf: z.string().refine(isValidCpf, "CPF inválido"),
});

export function checkoutRoutes(r: Router, deps: Deps, limiter: RateLimiter) {
  const { config, provider, sql } = deps;

  r.get("/v1/public/checkout/:slug", { access: "public", tag: "Checkout", summary: "Dados para montar o checkout de uma oferta" }, async ({ params, system }) =>
    system(async (tx) => {
      const offer = await loadOffer(tx, params.slug!);
      const fees = await accountFeeTable(tx, offer.account_id);
      const settings = await getPlatformSettings(tx);
      const bumps = await loadBumps(tx, offer.id);
      return {
        offer: { id: offer.id, slug: offer.slug, name: offer.name, price_cents: offer.price_cents, methods: offer.methods, config: resolveCheckoutConfig(offer.checkout_config) },
        product: { id: offer.product_id, name: offer.product_name, description: offer.product_description, cover_url: offer.cover_url, guarantee_days: offer.guarantee_days, type: offer.product_type },
        seller: { name: offer.seller_name, support_contact: offer.support_contact, verified: offer.kyc_status === "approved" },
        bumps: bumps.map((b) => ({ id: b.id, title: b.title, description: b.description, price_cents: b.price_cents })),
        installments: installmentsFor(offer.price_cents, fees, offer),
        pix_expires_minutes: settings.pixExpiresMinutes,
        // Com o provedor simulado, o checkout mostra os cartões de teste e o botão de simular o Pix.
        sandbox: provider.name === "sandbox" && config.env !== "production",
      };
    }),
  );

  r.post(
    "/v1/public/checkout/:slug/sessions",
    {
      access: "public",
      tag: "Checkout",
      summary: "Registrar a visita ao checkout (funil e recuperação de carrinho)",
      body: z.object({ utm: z.record(z.string().max(40), z.string().max(200)).default({}) }),
    },
    async ({ params, body, system, ip }) => {
      limiter.check(`visit:${ip}`, 120, 10 * 60_000);
      return system(async (tx) => {
        const offer = await loadOffer(tx, params.slug!);
        const [session] = await tx`insert into checkout_sessions (account_id, offer_id, utm) values (${offer.account_id}, ${offer.id}, ${tx.json(body.utm)}) returning id`;
        return { session_id: session!.id };
      });
    },
  );

  r.patch(
    "/v1/public/checkout-sessions/:id",
    {
      access: "public",
      tag: "Checkout",
      summary: "Salvar o preenchimento a cada campo",
      body: z.object({ name: z.string().max(120).optional(), email: z.string().max(254).optional(), phone: z.string().max(20).optional() }),
    },
    async ({ params, body, system, ip }) => {
      limiter.check(`fill:${ip}`, 300, 10 * 60_000);
      // O CPF não é guardado aqui: só nome e contato, que é o que a recuperação de carrinho usa.
      await system((tx) => tx`
        update checkout_sessions set fields = fields || ${tx.json(body)}, stage = case when stage = 'visited' then 'started' else stage end
        where id = ${params.id!} and stage in ('visited', 'started')`);
      return { ok: true };
    },
  );

  r.post(
    "/v1/public/checkout/:slug/quote",
    {
      access: "public",
      tag: "Checkout",
      summary: "Calcular o total com order bumps e cupom",
      body: z.object({ bump_ids: z.array(z.uuid()).max(3).default([]), coupon_code: z.string().max(30).optional() }),
    },
    async ({ params, body, system, ip }) => {
      limiter.check(`quote:${ip}`, 60, 10 * 60_000);
      return system(async (tx) => {
        const offer = await loadOffer(tx, params.slug!);
        const bumps = (await loadBumps(tx, offer.id)).filter((b) => body.bump_ids.includes(b.id));
        const itemsCents = offer.price_cents + bumps.reduce((a, b) => a + b.price_cents, 0);
        const { discountCents } = await couponDiscount(tx, offer, body.coupon_code, itemsCents, deps.now());
        const fees = await accountFeeTable(tx, offer.account_id);
        const total = itemsCents - discountCents;
        return { items_cents: itemsCents, discount_cents: discountCents, total_cents: total, installments: installmentsFor(total, fees, offer) };
      });
    },
  );

  r.post(
    "/v1/public/checkout/:slug/orders",
    {
      access: "public",
      tag: "Checkout",
      summary: "Criar o pedido e o pagamento (Pix ou cartão)",
      idempotent: true,
      body: z.object({
        session_id: z.uuid().optional(),
        buyer: buyerSchema,
        method: z.enum(["pix", "card"]),
        installments: z.number().int().min(1).max(12).default(1),
        /** Token do campo do provedor. O número do cartão nunca chega a esta API. */
        card_token: z.string().max(200).optional(),
        bump_ids: z.array(z.uuid()).max(3).default([]),
        coupon_code: z.string().max(30).optional(),
        utm: z.record(z.string().max(40), z.string().max(200)).default({}),
      }),
    },
    async ({ params, body, system, ip }) => {
      limiter.check(`order:${ip}`, 20, 10 * 60_000);
      const cpf = onlyDigits(body.buyer.cpf);
      // Teste de cartões: poucas tentativas por CPF e por IP.
      if (body.method === "card") limiter.check(`card:${ip}:${cpf}`, 6, 10 * 60_000);
      if (body.method === "card" && !body.card_token) throw badRequest("card_token_required", "Informe os dados do cartão.");
      const email = normalizeEmail(body.buyer.email);
      const phone = onlyDigits(body.buyer.phone);
      const token = randomToken(24);
      const now = deps.now();

      // 1) Pedido
      const ctx = await system(async (tx) => {
        const offer = await loadOffer(tx, params.slug!);
        if (!offer.methods.includes(body.method)) throw unprocessable("method_unavailable", "Esta forma de pagamento não está disponível nesta oferta.");
        const bumps = (await loadBumps(tx, offer.id)).filter((b) => body.bump_ids.includes(b.id));
        const itemsCents = offer.price_cents + bumps.reduce((a, b) => a + b.price_cents, 0);
        const { coupon, discountCents } = await couponDiscount(tx, offer, body.coupon_code, itemsCents, now);
        const fees = await accountFeeTable(tx, offer.account_id);
        if (body.method === "card" && body.installments > offer.max_installments) throw unprocessable("too_many_installments", "Número de parcelas acima do permitido nesta oferta.");
        const sale = computeSale(
          { method: body.method, priceCents: itemsCents - discountCents, installments: body.installments, interestPayer: offer.interest_payer },
          { ...fees, maxInstallments: Math.min(fees.maxInstallments, offer.max_installments) },
        );

        // Comprador: uma pessoa por e-mail. Dados de quem já existe não são trocados por um checkout.
        const [user] = await tx`
          insert into users (name, email, phone, phone_hash, cpf_enc, cpf_hash)
          values (${body.buyer.name}, ${email}, ${formatPhone(phone)}, ${identifierHash(config, "phone", phone)},
                  ${encryptField(cpf, config.fieldEncryptionKey)}, ${identifierHash(config, "cpf", cpf)})
          on conflict (email) do update set
            phone = coalesce(users.phone, excluded.phone), phone_hash = coalesce(users.phone_hash, excluded.phone_hash),
            cpf_enc = coalesce(users.cpf_enc, excluded.cpf_enc), cpf_hash = coalesce(users.cpf_hash, excluded.cpf_hash)
          returning id, name`;

        const [order] = await tx`
          insert into orders (account_id, product_id, offer_id, buyer_user_id, checkout_session_id, public_token_hash, method, installments,
            items_cents, discount_cents, gross_cents, buyer_total_cents, interest_cents, fee_cents, net_cents, fee_snapshot, coupon_id, utm)
          values (${offer.account_id}, ${offer.product_id}, ${offer.id}, ${user!.id}, ${body.session_id ?? null}, ${hashToken(token)}, ${body.method},
            ${sale.snapshot.installments}, ${itemsCents}, ${discountCents}, ${sale.grossCents}, ${sale.buyerTotalCents}, ${sale.interestCents},
            ${sale.feeCents}, ${sale.netCents}, ${tx.json(sale.snapshot as never)}, ${coupon?.id ?? null}, ${tx.json(body.utm)})
          returning *`;
        await tx`insert into order_items (account_id, order_id, product_id, offer_id, kind, title, price_cents)
                 values (${offer.account_id}, ${order!.id}, ${offer.product_id}, ${offer.id}, 'main', ${offer.product_name}, ${offer.price_cents})`;
        for (const b of bumps) {
          await tx`insert into order_items (account_id, order_id, product_id, offer_id, kind, title, price_cents)
                   values (${offer.account_id}, ${order!.id}, ${b.product_id}, ${b.offer_id}, 'bump', ${b.product_name}, ${b.price_cents})`;
        }
        if (body.session_id) await tx`update checkout_sessions set stage = 'payment_generated' where id = ${body.session_id} and offer_id = ${offer.id} and stage <> 'paid'`;
        await emitEvent(tx, offer.account_id, "order.created", { order: orderJson(order!), customer: { name: body.buyer.name, email } });
        const settings = await getPlatformSettings(tx);
        return { order: order!, offer, pixExpiresMinutes: settings.pixExpiresMinutes };
      });

      const { order, offer } = ctx;
      const payer = { name: body.buyer.name, email, document: cpf, phone };
      const base = { order_id: order.id, token, method: body.method, buyer_total_cents: order.buyer_total_cents, buyer_first_name: body.buyer.name.split(" ")[0] };

      // 2) Pagamento no provedor
      if (body.method === "pix") {
        const charge = await provider.createPixCharge({
          reference: order.id,
          amountCents: order.buyer_total_cents,
          payer,
          description: offer.product_name,
          expiresInSeconds: ctx.pixExpiresMinutes * 60,
        });
        await system(async (tx) => {
          await tx`insert into payments (account_id, order_id, provider, provider_ref, method, amount_cents, pix_copy_paste, expires_at)
                   values (${order.account_id}, ${order.id}, ${provider.name}, ${charge.providerRef}, 'pix', ${order.buyer_total_cents}, ${charge.copyPaste}, ${charge.expiresAt})`;
          await emitEvent(tx, order.account_id, "pix.generated", { order: orderJson(order) });
        });
        return { ...base, status: "pending", pix: { copy_paste: charge.copyPaste, expires_at: charge.expiresAt } };
      }

      const result = await provider.createCardCharge({
        reference: order.id,
        amountCents: order.buyer_total_cents,
        installments: order.installments,
        cardToken: body.card_token!,
        payer,
        description: offer.product_name,
      });
      if (result.status === "approved") {
        await system(async (tx) => {
          await tx`insert into payments (account_id, order_id, provider, provider_ref, method, amount_cents)
                   values (${order.account_id}, ${order.id}, ${provider.name}, ${result.providerRef}, 'card', ${order.buyer_total_cents})`;
          await tx`update orders set card_last4 = ${result.cardLast4} where id = ${order.id}`;
          await settleOrderPaid(tx, deps, order.id, deps.now());
        });
        return { ...base, status: "paid" };
      }
      await system(async (tx) => {
        await tx`insert into payments (account_id, order_id, provider, provider_ref, method, amount_cents, status)
                 values (${order.account_id}, ${order.id}, ${provider.name}, ${result.providerRef}, 'card', ${order.buyer_total_cents}, 'refused')`;
        const [refused] = await tx`update orders set status = 'refused', refusal_reason = ${result.reason} where id = ${order.id} returning *`;
        await emitEvent(tx, order.account_id, "order.refused", { order: orderJson(refused!), reason: result.reason });
      });
      return { ...base, status: "refused", reason: result.reason, message: CARD_REFUSAL_MESSAGES[result.reason] };
    },
  );

  /** Quem tem o token do pedido acompanha o pagamento sem login. */
  async function orderByToken(tx: Tx, id: string, token: string | undefined) {
    if (!token || !/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Pedido");
    const [order] = await tx`
      select o.*, p.name as product_name, u.name as buyer_name
      from orders o join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id where o.id = ${id}`;
    if (!order || !safeEqual(order.public_token_hash, hashToken(token))) throw notFound("Pedido");
    return order;
  }

  r.get(
    "/v1/public/orders/:id",
    { access: "public", tag: "Checkout", summary: "Acompanhar o pedido (com o token devolvido na criação)", query: z.object({ token: z.string().max(100) }) },
    async ({ params, query, system }) =>
      system(async (tx) => {
        const order = await orderByToken(tx, params.id!, query.token);
        const [payment] = await tx`select pix_copy_paste, expires_at from payments where order_id = ${order.id} order by created_at desc limit 1`;
        return {
          order_id: order.id,
          status: order.status,
          method: order.method,
          buyer_total_cents: order.buyer_total_cents,
          buyer_first_name: (order.buyer_name as string).split(" ")[0],
          product: { id: order.product_id, name: order.product_name },
          pix: order.method === "pix" && payment ? { copy_paste: payment.pix_copy_paste, expires_at: payment.expires_at } : null,
        };
      }),
  );

  r.get(
    "/v1/public/orders/:id/events",
    { access: "public", tag: "Checkout", summary: "Aviso em tempo real quando o pagamento é confirmado (SSE)", query: z.object({ token: z.string().max(100) }) },
    async ({ c, params, query, system }) => {
      const read = () => system(async (tx) => (await orderByToken(tx, params.id!, query.token)).status as string);
      const initial = await read();
      return streamSSE(c, async (stream) => {
        let status = initial;
        let wake: (() => void) | null = null;
        const unsubscribe = deps.orderBus.subscribe(params.id!, (s) => {
          status = s;
          wake?.();
        });
        stream.onAbort(() => {
          unsubscribe();
          wake?.();
        });
        try {
          await stream.writeSSE({ event: "status", data: status });
          const deadline = Date.now() + 20 * 60_000;
          while (status === "pending" && !stream.aborted && Date.now() < deadline) {
            // Espera o aviso; a cada 3 s confere no banco, caso o aviso tenha se perdido.
            await new Promise<void>((resolve) => {
              wake = resolve;
              setTimeout(resolve, 3000);
            });
            if (status === "pending") status = await read();
            if (status !== "pending") await stream.writeSSE({ event: "status", data: status });
            else await stream.writeSSE({ event: "ping", data: "" });
          }
        } finally {
          unsubscribe();
        }
      });
    },
  );

  r.post(
    "/v1/public/orders/:id/access",
    {
      access: "public",
      tag: "Checkout",
      summary: "Abrir o acesso ao produto logo depois de pagar (sessão limitada a este pedido)",
      body: z.object({ token: z.string().max(100) }),
    },
    async ({ params, body, system, c, ip }) => {
      limiter.check(`access:${ip}`, 30, 10 * 60_000);
      return system(async (tx) => {
        const order = await orderByToken(tx, params.id!, body.token);
        if (order.status !== "paid") throw unprocessable("order_not_paid", "O pagamento deste pedido ainda não foi confirmado.");
        if (order.paid_at < new Date(deps.now().getTime() - 24 * 3_600_000)) throw forbidden("Este acesso rápido venceu. Entre com o código enviado ao seu e-mail.");
        // Só enxerga este pedido: o acesso completo exige o código enviado ao e-mail da pessoa.
        const session = await createSession(tx, order.buyer_user_id, { userAgent: c.req.header("user-agent"), restrictedOrderId: order.id });
        return { session_token: session, redirect_to: `/assistir/${order.product_id}` };
      });
    },
  );

  r.post(
    "/v1/sandbox/orders/:id/pay",
    { access: "public", tag: "Ambiente de testes", summary: "Simular o pagamento do Pix (só com o provedor simulado)", body: z.object({ token: z.string().max(100) }) },
    async ({ params, body, system }) => {
      if (!(provider instanceof SandboxProvider) || config.env === "production") throw notFound("Rota");
      const ref = await system(async (tx) => {
        const order = await orderByToken(tx, params.id!, body.token);
        const [payment] = await tx`select provider_ref from payments where order_id = ${order.id} and status = 'pending' order by created_at desc limit 1`;
        return payment?.provider_ref as string | undefined;
      });
      if (!ref) throw unprocessable("no_pending_payment", "Este pedido não tem pagamento aguardando.");
      // Passa pelo mesmo caminho de uma notificação real: corpo assinado e validado.
      const hook = provider.buildWebhook({ type: "payment.confirmed", providerRef: ref });
      const event = provider.parseWebhook(hook.body, hook.headers);
      if (event) await handleProviderEvent(deps, event);
      return { ok: true };
    },
  );

  r.post(
    "/v1/provider-webhooks/:provider",
    { access: "public", tag: "Checkout", summary: "Notificações do provedor de pagamento", hidden: true },
    async ({ c, params }) => {
      if (params.provider !== provider.name) throw notFound("Provedor");
      const raw = await c.req.text();
      const event = provider.parseWebhook(raw, Object.fromEntries(c.req.raw.headers));
      if (!event) throw new ApiError(401, "invalid_signature", "Assinatura inválida.");
      await handleProviderEvent(deps, event);
      return { ok: true };
    },
  );

  // ── "Este link é verdadeiro?" (C08)

  r.post(
    "/v1/public/verify-link",
    { access: "public", tag: "Segurança", summary: "Conferir se um link de pagamento é da plataforma", body: z.object({ url: z.string().trim().min(4).max(500) }) },
    async ({ body, ip }) => {
      limiter.check(`verify-link:${ip}`, 30, 10 * 60_000);
      let url: URL;
      try {
        url = new URL(/^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`);
      } catch {
        return { genuine: false };
      }
      const official = new URL(config.webUrl);
      const slug = url.pathname.match(/^\/c\/([a-z0-9-]+)\/?$/)?.[1];
      if (url.host !== official.host || !slug || (config.env === "production" && url.protocol !== "https:")) return { genuine: false };
      const [offer] = await withContext(sql, { kind: "system" }, (tx) => tx`
        select p.name as product_name, a.name as seller_name, a.kyc_status
        from offers o join products p on p.id = o.product_id join accounts a on a.id = o.account_id
        where o.slug = ${slug} and o.active and p.status = 'approved' and a.status = 'active'`);
      if (!offer) return { genuine: false };
      const [first = "", ...rest] = (offer.seller_name as string).split(" ");
      return { genuine: true, product: offer.product_name, seller: `${first}${rest.length ? ` ${rest.at(-1)![0]}.` : ""}`, seller_verified: offer.kyc_status === "approved" };
    },
  );

  r.post(
    "/v1/public/report-link",
    {
      access: "public",
      tag: "Segurança",
      summary: "Denunciar um link falso",
      body: z.object({ url: z.string().trim().min(4).max(500), contact: z.string().trim().max(254).optional() }),
    },
    async ({ body, system, ip }) => {
      limiter.check(`report-link:${ip}`, 10, 10 * 60_000);
      await system((tx) => tx`insert into link_reports (url, reporter_contact) values (${body.url}, ${body.contact ?? null})`);
      return { ok: true };
    },
  );

  r.get(
    "/v1/public/fee-simulator",
    { access: "public", tag: "Taxas", summary: "Simulador: quanto o produtor recebe por venda", query: z.object({ price_cents: z.coerce.number().int().min(100).max(10_000_000) }) },
    async ({ query, system }) => {
      const { fees } = await system((tx) => getPlatformSettings(tx));
      const row = (method: "pix" | "card") => {
        const sale = computeSale({ method, priceCents: query.price_cents }, fees);
        return { fee_cents: sale.feeCents, net_cents: sale.netCents, label: `Você recebe ${formatBRL(sale.netCents)}` };
      };
      return { price_cents: query.price_cents, pix: row("pix"), card: row("card") };
    },
  );
}
