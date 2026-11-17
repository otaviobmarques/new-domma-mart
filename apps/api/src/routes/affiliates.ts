import { randomBytes } from "node:crypto";
import { affiliateCommission, computeSale, formatBRL, normalizeEmail } from "@domma/core";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { notFound, unprocessable } from "../lib/errors.ts";
import type { RateLimiter } from "../lib/rate-limit.ts";
import { ROLES_ADMIN, type Router, created } from "../lib/router.ts";
import { commissionOf } from "../services/affiliates.ts";
import { audit } from "../services/audit.ts";
import { enqueueEmail } from "../services/notify.ts";
import { accountFeeTable } from "../services/sales.ts";
import { uuidOr404 } from "./seller.ts";

const TZ = "America/Sao_Paulo";
const newCode = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();
const httpsUrl = z.string().trim().max(500).regex(/^https:\/\/[^\s"'<>]+$/i, "O endereço precisa começar com https://");

const programInput = z.object({
  mode: z.enum(["closed", "open", "approval"]),
  commission_type: z.enum(["percent", "fixed"]),
  commission_bps: z.number().int().min(0).max(9000).default(0),
  commission_cents: z.number().int().min(0).max(10_000_000).default(0),
  attribution: z.enum(["first", "last"]).default("last"),
  cookie_days: z.number().int().min(1).max(365).default(30),
  materials: z.array(z.object({ title: z.string().trim().min(1).max(120), url: httpsUrl })).max(20).default([]),
});

export function affiliateRoutes(r: Router, deps: Deps, limiter: RateLimiter) {
  const { config } = deps;
  const linkOf = (slug: string, code: string) => `${config.webUrl}/c/${slug}?ref=${code}`;
  const ownerEmail = async (tx: any, accountId: string) => (await tx`select u.email, a.name from accounts a join users u on u.id = a.owner_user_id where a.id = ${accountId}`)[0];

  // ── P10 · Produtor: programa de afiliados e coprodução

  r.get("/v1/affiliates", { access: "account", tag: "Afiliados", summary: "Programas de afiliados, pedidos pendentes e coprodutores dos seus produtos", scope: "products:read" }, async ({ db, system, accountId }) => {
    const products = await db(
      (tx) => tx`
        select id, name, status, affiliate_mode, affiliate_commission_type, affiliate_commission_bps, affiliate_commission_cents,
               affiliate_attribution, affiliate_cookie_days, affiliate_materials
        from products where status <> 'blocked' order by created_at desc`,
    );
    // Nomes de afiliados e coprodutores são de outras contas: a leitura é feita pelo sistema, sempre filtrada pelos produtos desta conta.
    return system(async (tx) => {
      const affiliations = await tx`
        select f.id, f.product_id, f.status, f.code, f.commission_type, f.commission_bps, f.commission_cents, f.clicks, f.created_at,
               a.name as affiliate_name, u.email as affiliate_email,
               (select count(*) from orders o where o.affiliation_id = f.id and o.status = 'paid') as sales,
               (select coalesce(sum(s.amount_cents), 0) from order_splits s join orders o on o.id = s.order_id where s.affiliation_id = f.id and o.status = 'paid') as commission_cents_total
        from affiliations f join accounts a on a.id = f.affiliate_account_id join users u on u.id = a.owner_user_id
        where f.account_id = ${accountId} order by (f.status = 'pending') desc, f.created_at desc limit 500`;
      const coproductions = await tx`
        select c.id, c.product_id, c.percent_bps, c.status, c.ends_at, c.accepted_at, c.created_at, a.name as coproducer_name, u.email as coproducer_email,
               (select coalesce(sum(s.amount_cents), 0) from order_splits s join orders o on o.id = s.order_id where s.coproduction_id = c.id and o.status = 'paid') as paid_cents_total
        from coproductions c join accounts a on a.id = c.coproducer_account_id join users u on u.id = a.owner_user_id
        where c.account_id = ${accountId} and c.status <> 'declined' order by c.created_at desc limit 200`;
      return {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          program: {
            mode: p.affiliate_mode,
            commission_type: p.affiliate_commission_type,
            commission_bps: p.affiliate_commission_bps,
            commission_cents: p.affiliate_commission_cents,
            attribution: p.affiliate_attribution,
            cookie_days: p.affiliate_cookie_days,
            materials: p.affiliate_materials,
          },
          affiliates: affiliations.filter((f) => f.product_id === p.id),
          coproducers: coproductions.filter((c) => c.product_id === p.id),
        })),
        pending: affiliations.filter((f) => f.status === "pending").length,
      };
    });
  });

  r.put(
    "/v1/products/:id/affiliate-program",
    { access: "account", tag: "Afiliados", summary: "Ligar, desligar e configurar o programa de afiliados de um produto. Vale para vendas futuras.", scope: "products:write", roles: ROLES_ADMIN, body: programInput },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        if (body.mode !== "closed" && body.commission_type === "percent" && body.commission_bps < 100) throw unprocessable("commission_too_low", "A comissão precisa ser de pelo menos 1%.");
        if (body.mode !== "closed" && body.commission_type === "fixed" && body.commission_cents < 100) throw unprocessable("commission_too_low", "A comissão precisa ser de pelo menos R$ 1,00.");
        const [product] = await tx`
          update products set affiliate_mode = ${body.mode}, affiliate_commission_type = ${body.commission_type}, affiliate_commission_bps = ${body.commission_bps},
            affiliate_commission_cents = ${body.commission_cents}, affiliate_attribution = ${body.attribution}, affiliate_cookie_days = ${body.cookie_days},
            affiliate_materials = ${tx.json(body.materials as never)}
          where id = ${uuidOr404(params.id!)} returning id`;
        if (!product) throw notFound("Produto");
        await audit(tx, { auth, action: "affiliate_program.updated", target: product.id, data: { mode: body.mode, commission_type: body.commission_type, commission_bps: body.commission_bps, commission_cents: body.commission_cents } });
        return { id: product.id, program: body };
      }),
  );

  r.post(
    "/v1/affiliations/:id/decision",
    { access: "account", tag: "Afiliados", summary: "Aprovar, recusar, bloquear ou reativar um afiliado", scope: "products:write", roles: ROLES_ADMIN, body: z.object({ decision: z.enum(["approve", "reject", "block"]) }) },
    async ({ params, body, system, accountId, auth }) =>
      system(async (tx) => {
        const status = { approve: "approved", reject: "rejected", block: "blocked" }[body.decision];
        const [f] = await tx`
          update affiliations set status = ${status}, decided_at = now() where id = ${uuidOr404(params.id!)} and account_id = ${accountId}
          returning id, product_id, affiliate_account_id, code`;
        if (!f) throw notFound("Afiliado");
        const [product] = await tx`select p.name, (select o.slug from offers o where o.product_id = p.id and o.is_default) as slug from products p where p.id = ${f.product_id}`;
        const owner = await ownerEmail(tx, f.affiliate_account_id);
        if (body.decision === "approve")
          await enqueueEmail(tx, owner.email, "notice", {
            title: `Você já pode divulgar ${product!.name}`,
            message: `O produtor aprovou o seu pedido. O seu link exclusivo já está no painel, em Afiliados.\n\n${linkOf(product!.slug, f.code)}`,
            link: `${config.webUrl}/painel/afiliados/divulgar`,
            link_label: "Abrir meus links",
          });
        await audit(tx, { auth, accountId, action: `affiliation.${body.decision}`, target: f.id });
        return { id: f.id, status };
      }),
  );

  r.patch(
    "/v1/affiliations/:id",
    {
      access: "account",
      tag: "Afiliados",
      summary: "Definir uma comissão própria para um afiliado (ou voltar para a do programa). Vale para vendas futuras.",
      scope: "products:write",
      roles: ROLES_ADMIN,
      body: z.object({ commission_type: z.enum(["percent", "fixed"]).nullable(), commission_bps: z.number().int().min(100).max(9000).optional(), commission_cents: z.number().int().min(100).max(10_000_000).optional() }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        if (body.commission_type === "percent" && body.commission_bps == null) throw unprocessable("commission_required", "Informe o percentual.");
        if (body.commission_type === "fixed" && body.commission_cents == null) throw unprocessable("commission_required", "Informe o valor.");
        const [f] = await tx`
          update affiliations set commission_type = ${body.commission_type}, commission_bps = ${body.commission_type === "percent" ? body.commission_bps! : null},
            commission_cents = ${body.commission_type === "fixed" ? body.commission_cents! : null}
          where id = ${uuidOr404(params.id!)} and account_id = app.account_id() returning id`;
        if (!f) throw notFound("Afiliado");
        await audit(tx, { auth, action: "affiliation.commission_changed", target: f.id, data: body });
        return { id: f.id };
      }),
  );

  r.post(
    "/v1/products/:id/coproducers",
    {
      access: "account",
      tag: "Afiliados",
      summary: "Convidar um coprodutor. A divisão só começa depois que ele aceitar.",
      scope: "products:write",
      roles: ROLES_ADMIN,
      body: z.object({ email: z.string().trim().max(254), percent_bps: z.number().int().min(100).max(9000), ends_at: z.iso.datetime().nullable().optional() }),
    },
    async ({ params, body, system, accountId, auth }) =>
      system(async (tx) => {
        const [product] = await tx`select id, name from products where id = ${uuidOr404(params.id!)} and account_id = ${accountId}`;
        if (!product) throw notFound("Produto");
        const [target] = await tx`select a.id, a.name, u.email from users u join accounts a on a.owner_user_id = u.id where u.email = ${normalizeEmail(body.email)} and a.status = 'active' order by a.created_at limit 1`;
        if (!target) throw unprocessable("coproducer_not_found", "Não encontramos uma conta com este e-mail. Peça para a pessoa criar a conta no Domma Mart primeiro.");
        if (target.id === accountId) throw unprocessable("coproducer_self", "Você não pode ser coprodutor do seu próprio produto.");
        if (body.ends_at && new Date(body.ends_at) <= deps.now()) throw unprocessable("invalid_end", "A data final precisa ser no futuro.");
        const [total] = await tx`select coalesce(sum(percent_bps), 0) as bps from coproductions where product_id = ${product.id} and status in ('invited', 'accepted')`;
        if (total!.bps + body.percent_bps > 9000) throw unprocessable("too_much", "A soma dos coprodutores não pode passar de 90%.");
        const [exists] = await tx`select 1 from coproductions where product_id = ${product.id} and coproducer_account_id = ${target.id} and status in ('invited', 'accepted')`;
        if (exists) throw unprocessable("already_coproducer", "Esta pessoa já é coprodutora ou já tem um convite em aberto para este produto.");
        const [row] = await tx`
          insert into coproductions (account_id, product_id, coproducer_account_id, percent_bps, ends_at)
          values (${accountId}, ${product.id}, ${target.id}, ${body.percent_bps}, ${body.ends_at ?? null}) returning id, status`;
        const me = await ownerEmail(tx, accountId);
        await enqueueEmail(tx, target.email, "notice", {
          title: `Convite de coprodução: ${product.name}`,
          message: `${me.name} convidou você para ser coprodutor de "${product.name}", com ${(body.percent_bps / 100).toLocaleString("pt-BR")}% de cada venda, depois da taxa e da comissão de afiliados.\n\nA divisão só começa se você aceitar.`,
          link: `${config.webUrl}/painel/afiliados/divulgar`,
          link_label: "Ver o convite",
        });
        await audit(tx, { auth, accountId, action: "coproduction.invited", target: row!.id, data: { percent_bps: body.percent_bps } });
        return created(row!);
      }),
  );

  r.delete("/v1/coproductions/:id", { access: "account", tag: "Afiliados", summary: "Encerrar uma coprodução (ou cancelar o convite). Vendas já feitas não mudam.", scope: "products:write", roles: ROLES_ADMIN }, async ({ params, db, auth }) =>
    db(async (tx) => {
      // Qualquer uma das duas partes pode encerrar.
      const [c] = await tx`update coproductions set status = 'ended', ended_at = now() where id = ${uuidOr404(params.id!)} and status in ('invited', 'accepted') returning id`;
      if (!c) throw notFound("Coprodução");
      await audit(tx, { auth, action: "coproduction.ended", target: c.id });
      return { ok: true };
    }),
  );

  // ── A01 · Portal do afiliado, em uma tela só

  r.get(
    "/v1/affiliate/portal",
    { access: "account", tag: "Afiliados", summary: "Portal do afiliado: comissões do mês, produtos que você divulga, produtos para divulgar e convites de coprodução", query: z.object({ q: z.string().trim().max(80).optional() }) },
    async ({ query, system, accountId }) =>
      system(async (tx) => {
        const [month] = await tx`
          select coalesce(sum(s.amount_cents), 0) as cents from order_splits s join orders o on o.id = s.order_id
          where s.account_id = ${accountId} and o.status = 'paid' and o.paid_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}`;
        const fees = new Map<string, Awaited<ReturnType<typeof accountFeeTable>>>();
        const feesOf = async (id: string) => fees.get(id) ?? fees.set(id, await accountFeeTable(tx, id)).get(id)!;
        // Quanto o afiliado ganha por venda, em reais, numa venda por Pix da oferta principal.
        const earn = async (p: Record<string, any>, affiliation?: Record<string, any>) => {
          const sale = computeSale({ method: "pix", priceCents: p.price_cents, installments: 1, interestPayer: "buyer" }, await feesOf(p.account_id));
          return affiliateCommission(commissionOf(p, affiliation), sale.grossCents, sale.netCents);
        };
        const mine = await tx`
          select f.id, f.status, f.code, f.clicks, f.commission_type, f.commission_bps, f.commission_cents, f.created_at,
                 p.id as product_id, p.account_id, p.name, p.cover_url, p.affiliate_mode, p.affiliate_commission_type, p.affiliate_commission_bps, p.affiliate_commission_cents,
                 p.affiliate_materials, p.status as product_status, a.name as seller_name, o.slug, o.price_cents,
                 (select count(*) from orders x where x.affiliation_id = f.id and x.status = 'paid') as sales,
                 (select coalesce(sum(s.amount_cents), 0) from order_splits s join orders x on x.id = s.order_id where s.affiliation_id = f.id and x.status = 'paid') as commission_cents_total
          from affiliations f join products p on p.id = f.product_id join accounts a on a.id = p.account_id
          join offers o on o.product_id = p.id and o.is_default
          where f.affiliate_account_id = ${accountId} and f.status <> 'rejected' order by f.created_at desc limit 100`;
        const like = query.q ? `%${query.q.toLowerCase()}%` : null;
        const discover = await tx`
          select p.id as product_id, p.account_id, p.name, p.description, p.cover_url, p.type, p.affiliate_mode, p.affiliate_commission_type, p.affiliate_commission_bps,
                 p.affiliate_commission_cents, a.name as seller_name, o.price_cents
          from products p join accounts a on a.id = p.account_id join offers o on o.product_id = p.id and o.is_default and o.active
          where p.status = 'approved' and p.affiliate_mode in ('open', 'approval') and a.status = 'active' and p.account_id <> ${accountId}
            and not exists (select 1 from affiliations f where f.product_id = p.id and f.affiliate_account_id = ${accountId})
            and (${like}::text is null or lower(p.name) like ${like} or lower(a.name) like ${like})
          order by p.created_at desc limit 40`;
        const coproductions = await tx`
          select c.id, c.percent_bps, c.status, c.ends_at, c.created_at, p.name as product_name, a.name as seller_name,
                 (select coalesce(sum(s.amount_cents), 0) from order_splits s join orders o on o.id = s.order_id where s.coproduction_id = c.id and o.status = 'paid') as paid_cents_total
          from coproductions c join products p on p.id = c.product_id join accounts a on a.id = c.account_id
          where c.coproducer_account_id = ${accountId} and c.status in ('invited', 'accepted') order by (c.status = 'invited') desc, c.created_at desc`;
        const recent = await tx`
          select s.amount_cents, s.role, o.number, o.status, o.paid_at, p.name as product_name
          from order_splits s join orders o on o.id = s.order_id join products p on p.id = o.product_id
          where s.account_id = ${accountId} and o.status in ('paid', 'refunded', 'chargeback') order by o.paid_at desc limit 15`;
        return {
          month_commission_cents: month!.cents,
          mine: await Promise.all(
            mine.map(async (f) => ({
              id: f.id,
              status: f.status,
              product_id: f.product_id,
              name: f.name,
              cover_url: f.cover_url,
              seller_name: f.seller_name,
              price_cents: f.price_cents,
              // O link só existe para quem foi aprovado e enquanto o produto e o programa estão no ar.
              link: f.status === "approved" && f.product_status === "approved" && f.affiliate_mode !== "closed" ? linkOf(f.slug, f.code) : null,
              paused: f.product_status !== "approved" || f.affiliate_mode === "closed",
              clicks: f.clicks,
              sales: f.sales,
              commission_cents_total: f.commission_cents_total,
              earn_cents: await earn(f, f),
              materials: f.status === "approved" ? f.affiliate_materials : [],
            })),
          ),
          discover: await Promise.all(
            discover.map(async (p) => ({ product_id: p.product_id, name: p.name, description: p.description, cover_url: p.cover_url, type: p.type, seller_name: p.seller_name, price_cents: p.price_cents, mode: p.affiliate_mode, earn_cents: await earn(p) })),
          ),
          coproductions,
          recent,
        };
      }),
  );

  r.post("/v1/affiliate/products/:id/join", { access: "account", tag: "Afiliados", summary: "Divulgar um produto. Em programa aberto, o link sai na hora; com aprovação, o produtor decide.", roles: ROLES_ADMIN }, async ({ params, system, accountId, auth }) =>
    system(async (tx) => {
      const [p] = await tx`
        select p.id, p.account_id, p.name, p.affiliate_mode, (select o.slug from offers o where o.product_id = p.id and o.is_default) as slug
        from products p join accounts a on a.id = p.account_id
        where p.id = ${uuidOr404(params.id!)} and p.status = 'approved' and p.affiliate_mode in ('open', 'approval') and a.status = 'active'`;
      if (!p) throw notFound("Produto");
      if (p.account_id === accountId) throw unprocessable("own_product", "Este produto é seu: você não precisa de link de afiliado para vender.");
      const status = p.affiliate_mode === "open" ? "approved" : "pending";
      const [f] = await tx`
        insert into affiliations (account_id, product_id, affiliate_account_id, status, code, decided_at)
        values (${p.account_id}, ${p.id}, ${accountId}, ${status}, ${newCode()}, ${status === "approved" ? deps.now() : null})
        on conflict (product_id, affiliate_account_id) do nothing returning id, code, status`;
      if (!f) throw unprocessable("already_joined", "Você já pediu para divulgar este produto.");
      if (status === "pending") {
        const owner = await ownerEmail(tx, p.account_id);
        const me = await ownerEmail(tx, accountId);
        await enqueueEmail(tx, owner.email, "notice", {
          title: `Novo pedido de afiliação: ${p.name}`,
          message: `${me.name} quer divulgar "${p.name}". Aprove ou recuse pelo painel.`,
          link: `${config.webUrl}/painel/afiliados`,
          link_label: "Ver o pedido",
        });
      }
      await audit(tx, { auth, accountId, action: "affiliation.requested", target: f.id });
      return created({ id: f.id, status: f.status, link: f.status === "approved" ? linkOf(p.slug, f.code) : null });
    }),
  );

  r.post("/v1/coproductions/:id/respond", { access: "account", tag: "Afiliados", summary: "Aceitar ou recusar um convite de coprodução", roles: ROLES_ADMIN, body: z.object({ accept: z.boolean() }) }, async ({ params, body, system, accountId, auth }) =>
    system(async (tx) => {
      const [c] = await tx`
        update coproductions set status = ${body.accept ? "accepted" : "declined"}, accepted_at = ${body.accept ? deps.now() : null}
        where id = ${uuidOr404(params.id!)} and coproducer_account_id = ${accountId} and status = 'invited'
        returning id, account_id, product_id, percent_bps`;
      if (!c) throw notFound("Convite");
      const [product] = await tx`select name from products where id = ${c.product_id}`;
      const owner = await ownerEmail(tx, c.account_id);
      const me = await ownerEmail(tx, accountId);
      await enqueueEmail(tx, owner.email, "notice", {
        title: body.accept ? `${me.name} aceitou a coprodução de ${product!.name}` : `${me.name} recusou a coprodução de ${product!.name}`,
        message: body.accept ? `A partir de agora, ${(c.percent_bps / 100).toLocaleString("pt-BR")}% de cada venda vai para ${me.name}, depois da taxa e da comissão de afiliados.` : "Nada muda na divisão das suas vendas.",
        link: `${config.webUrl}/painel/afiliados`,
      });
      await audit(tx, { auth, accountId, action: body.accept ? "coproduction.accepted" : "coproduction.declined", target: c.id });
      return { id: c.id, status: body.accept ? "accepted" : "declined" };
    }),
  );

  // ── Link do afiliado: o checkout pergunta as regras e registra o clique

  r.post("/v1/public/affiliate-links/:code/click", { access: "public", tag: "Checkout", summary: "Registrar o clique em um link de afiliado e devolver a regra de atribuição", hidden: true }, async ({ params, system, ip }) => {
    limiter.check(`ref-click:${ip}`, 60, 10 * 60_000);
    return system(async (tx) => {
      const [f] = await tx`
        update affiliations f set clicks = clicks + 1 from products p
        where f.code = ${params.code!} and f.status = 'approved' and p.id = f.product_id and p.affiliate_mode <> 'closed'
        returning f.product_id, p.affiliate_attribution, p.affiliate_cookie_days`;
      if (!f) return { valid: false };
      return { valid: true, product_id: f.product_id, attribution: f.affiliate_attribution, days: f.affiliate_cookie_days };
    });
  });
}

export const commissionLabel = (c: { type: string; bps: number; cents: number }) => (c.type === "percent" ? `${(c.bps / 100).toLocaleString("pt-BR")}%` : formatBRL(c.cents));
