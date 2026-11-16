import { randomBytes } from "node:crypto";
import { CHECKOUT_ACCENTS, COUNTDOWN_OPTIONS, resolveCheckoutConfig } from "@domma/core";
import type { Tx } from "@domma/db";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { notFound, unprocessable } from "../lib/errors.ts";
import type { RateLimiter } from "../lib/rate-limit.ts";
import { ROLES_ADMIN, type Router, created } from "../lib/router.ts";
import { generateProductDraft, triageProduct } from "../services/ai.ts";
import { audit } from "../services/audit.ts";

const PRODUCT_TYPES = ["course", "file", "subscription", "community", "event", "service"] as const;

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "oferta"}-${randomBytes(3).toString("hex")}`;
}

const offerInput = z.object({
  name: z.string().trim().min(1).max(80).default("Oferta principal"),
  price_cents: z.number().int().min(100).max(10_000_000),
  max_installments: z.number().int().min(1).max(12).default(12),
  interest_payer: z.enum(["buyer", "producer"]).default("buyer"),
  methods: z.array(z.enum(["pix", "card"])).min(1).default(["pix", "card"]),
});

const moduleInput = z.object({
  title: z.string().trim().min(1).max(120),
  lessons: z.array(z.object({ title: z.string().trim().min(1).max(160), description: z.string().max(5000).optional() })).max(200).default([]),
});

export async function getProduct(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Produto");
  const [product] = await tx`select * from products where id = ${id}`;
  if (!product) throw notFound("Produto");
  return product;
}

export function catalogRoutes(r: Router, deps: Deps, limiter: RateLimiter) {
  const { config } = deps;
  const checkoutUrl = (slug: string) => `${config.webUrl}/c/${slug}`;

  r.get("/v1/products", { access: "account", tag: "Produtos", summary: "Listar produtos", scope: "products:read" }, async ({ db }) => {
    const rows = await db((tx) => tx`
      select p.id, p.name, p.type, p.status, p.cover_url, p.guarantee_days, p.review_reason, p.created_at,
             o.id as default_offer_id, o.slug as offer_slug, o.price_cents,
             (select count(*) from orders x where x.product_id = p.id and x.status = 'paid' and x.env = 'live'
                and x.paid_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as sales_month
      from products p
      left join offers o on o.product_id = p.id and o.is_default
      order by p.created_at desc`);
    return { data: rows.map((p) => ({ ...p, checkout_url: p.offer_slug ? checkoutUrl(p.offer_slug) : null })) };
  });

  r.post(
    "/v1/products",
    {
      access: "account",
      tag: "Produtos",
      summary: "Criar produto (rascunho) com a oferta principal e, se quiser, a estrutura do curso",
      scope: "products:write",
      roles: ROLES_ADMIN,
      idempotent: true,
      body: z.object({
        name: z.string().trim().min(3).max(120),
        description: z.string().trim().max(5000).default(""),
        type: z.enum(PRODUCT_TYPES).default("course"),
        guarantee_days: z.number().int().min(7).max(90).default(7),
        cover_url: z.url().max(500).optional(),
        ai_generated: z.boolean().default(false),
        offer: offerInput,
        modules: z.array(moduleInput).max(50).default([]),
      }),
    },
    async ({ body, db, auth, accountId }) => {
      const result = await db(async (tx) => {
        const [product] = await tx`
          insert into products (account_id, name, description, type, guarantee_days, cover_url, ai_generated)
          values (${accountId}, ${body.name}, ${body.description}, ${body.type}, ${body.guarantee_days}, ${body.cover_url ?? null}, ${body.ai_generated})
          returning *`;
        const [offer] = await tx`
          insert into offers (account_id, product_id, name, slug, price_cents, max_installments, interest_payer, methods, is_default)
          values (${accountId}, ${product!.id}, ${body.offer.name}, ${slugify(body.name)}, ${body.offer.price_cents}, ${body.offer.max_installments},
                  ${body.offer.interest_payer}, ${body.offer.methods}, true)
          returning *`;
        for (const [m, mod] of body.modules.entries()) {
          const [row] = await tx`insert into modules (account_id, product_id, title, position) values (${accountId}, ${product!.id}, ${mod.title}, ${m}) returning id`;
          for (const [l, lesson] of mod.lessons.entries()) {
            await tx`insert into lessons (account_id, product_id, module_id, title, description, position)
                     values (${accountId}, ${product!.id}, ${row!.id}, ${lesson.title}, ${lesson.description ?? ""}, ${l})`;
          }
        }
        await audit(tx, { auth, action: "product.created", target: product!.id, data: { ai_generated: body.ai_generated } });
        return { ...product, offers: [{ ...offer, checkout_url: checkoutUrl(offer!.slug) }] };
      });
      return created(result);
    },
  );

  r.get("/v1/products/:id", { access: "account", tag: "Produtos", summary: "Consultar produto, ofertas e conteúdo", scope: "products:read" }, async ({ params, db }) =>
    db(async (tx) => {
      const product = await getProduct(tx, params.id!);
      const offers = await tx`select * from offers where product_id = ${product.id} order by is_default desc, created_at`;
      const modules = await tx`select id, title, position from modules where product_id = ${product.id} order by position`;
      const lessons = await tx`select id, module_id, title, description, video_url, duration_seconds, position, release_after_days from lessons where product_id = ${product.id} order by position`;
      const bumps = await tx`
        select b.id, b.offer_id, b.bump_offer_id, b.title, b.description, o.price_cents
        from order_bumps b join offers o on o.id = b.bump_offer_id where b.offer_id in (select id from offers where product_id = ${product.id}) and b.active`;
      return {
        ...product,
        offers: offers.map((o) => ({ ...o, checkout_url: checkoutUrl(o.slug) })),
        modules: modules.map((m) => ({ ...m, lessons: lessons.filter((l) => l.module_id === m.id) })),
        bumps,
      };
    }),
  );

  r.patch(
    "/v1/products/:id",
    {
      access: "account",
      tag: "Produtos",
      summary: "Alterar produto",
      scope: "products:write",
      roles: ROLES_ADMIN,
      body: z.object({
        name: z.string().trim().min(3).max(120).optional(),
        description: z.string().trim().max(5000).optional(),
        guarantee_days: z.number().int().min(7).max(90).optional(),
        cover_url: z.url().max(500).nullable().optional(),
        support_contact: z.string().trim().max(120).nullable().optional(),
      }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const product = await getProduct(tx, params.id!);
        if (product.status === "blocked") throw unprocessable("product_blocked", "Este produto está bloqueado e não pode ser alterado.");
        const [updated] = await tx`
          update products set
            name = ${body.name ?? product.name},
            description = ${body.description ?? product.description},
            guarantee_days = ${body.guarantee_days ?? product.guarantee_days},
            cover_url = ${body.cover_url === undefined ? product.cover_url : body.cover_url},
            support_contact = ${body.support_contact === undefined ? product.support_contact : body.support_contact}
          where id = ${product.id} returning *`;
        await audit(tx, { auth, action: "product.updated", target: product.id });
        return updated;
      }),
  );

  r.post(
    "/v1/products/:id/publish",
    { access: "account", tag: "Produtos", summary: "Publicar: o produto passa pela análise e, se aprovado, já pode vender", scope: "products:write", roles: ROLES_ADMIN },
    async ({ params, db, auth }) =>
      db(async (tx) => {
        const product = await getProduct(tx, params.id!);
        if (!["draft", "in_review"].includes(product.status)) throw unprocessable("already_published", "Este produto já foi publicado.");
        const result = triageProduct({ name: product.name, description: product.description });
        const status = result.triage === "approve" ? "approved" : "in_review";
        const [updated] = await tx`
          update products set status = ${status}, review_triage = ${result.triage}, review_reason = ${result.reason},
            reviewed_at = ${status === "approved" ? deps.now() : null}
          where id = ${product.id} returning *`;
        await audit(tx, { auth, action: "product.published", target: product.id, data: { triage: result.triage, reason: result.reason, automatic: true } });
        return updated;
      }),
  );

  for (const [action, from, to] of [
    ["pause", "approved", "paused"],
    ["resume", "paused", "approved"],
  ] as const) {
    r.post(
      `/v1/products/:id/${action}`,
      { access: "account", tag: "Produtos", summary: action === "pause" ? "Pausar vendas" : "Voltar a vender", scope: "products:write", roles: ROLES_ADMIN },
      async ({ params, db, auth }) =>
        db(async (tx) => {
          const product = await getProduct(tx, params.id!);
          if (product.status !== from) throw unprocessable("invalid_status", action === "pause" ? "Só dá para pausar um produto aprovado." : "Este produto não está pausado.");
          const [updated] = await tx`update products set status = ${to} where id = ${product.id} returning *`;
          await audit(tx, { auth, action: `product.${action}d`, target: product.id });
          return updated;
        }),
    );
  }

  // ── Ofertas

  r.post(
    "/v1/products/:id/offers",
    { access: "account", tag: "Ofertas", summary: "Criar oferta (outro preço ou parcelamento para o mesmo produto)", scope: "products:write", roles: ROLES_ADMIN, body: offerInput },
    async ({ params, body, db, accountId, auth }) => {
      const offer = await db(async (tx) => {
        const product = await getProduct(tx, params.id!);
        const [row] = await tx`
          insert into offers (account_id, product_id, name, slug, price_cents, max_installments, interest_payer, methods)
          values (${accountId}, ${product.id}, ${body.name}, ${slugify(product.name)}, ${body.price_cents}, ${body.max_installments}, ${body.interest_payer}, ${body.methods})
          returning *`;
        await audit(tx, { auth, action: "offer.created", target: row!.id });
        return row!;
      });
      return created({ ...offer, checkout_url: checkoutUrl(offer.slug) });
    },
  );

  r.patch(
    "/v1/offers/:id",
    {
      access: "account",
      tag: "Ofertas",
      summary: "Alterar oferta (vale para as próximas vendas)",
      scope: "products:write",
      roles: ROLES_ADMIN,
      body: offerInput.partial().extend({ active: z.boolean().optional() }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const [offer] = await tx`select * from offers where id = ${params.id!}`;
        if (!offer) throw notFound("Oferta");
        const [updated] = await tx`
          update offers set
            name = ${body.name ?? offer.name}, price_cents = ${body.price_cents ?? offer.price_cents},
            max_installments = ${body.max_installments ?? offer.max_installments}, interest_payer = ${body.interest_payer ?? offer.interest_payer},
            methods = ${body.methods ?? offer.methods}, active = ${body.active ?? offer.active}
          where id = ${offer.id} returning *`;
        await audit(tx, { auth, action: "offer.updated", target: offer.id, data: { price_cents: updated!.price_cents } });
        return { ...updated, checkout_url: checkoutUrl(updated!.slug) };
      }),
  );

  // ── Editor de checkout (P06)

  const httpsUrl = z.string().trim().max(500).regex(/^https:\/\/[^\s"'<>]+$/i, "Use um endereço que comece com https://");
  const checkoutConfigInput = z.object({
    accent: z.enum(CHECKOUT_ACCENTS).default("yellow"),
    logo_url: httpsUrl.nullable().default(null),
    banner_url: httpsUrl.nullable().default(null),
    show_guarantee: z.boolean().default(true),
    countdown_minutes: z.number().int().refine((n) => (COUNTDOWN_OPTIONS as readonly number[]).includes(n), "Tempo do contador inválido").default(0),
    button_text: z.string().trim().max(40).default(""),
    testimonials: z.array(z.object({ name: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(280) })).max(3).default([]),
  });

  r.put(
    "/v1/offers/:id/checkout",
    {
      access: "account",
      tag: "Ofertas",
      summary: "Salvar a personalização do checkout. Com publish=false fica só no rascunho; com publish=true vai ao ar.",
      scope: "products:write",
      roles: ROLES_ADMIN,
      body: z.object({ config: checkoutConfigInput, publish: z.boolean().default(false) }),
    },
    async ({ params, body, db, auth }) =>
      db(async (tx) => {
        const config = resolveCheckoutConfig(body.config);
        const [offer] = body.publish
          ? await tx`update offers set checkout_draft = null, checkout_config = ${tx.json(config as never)} where id = ${params.id!} returning id, checkout_config, checkout_draft`
          : await tx`update offers set checkout_draft = ${tx.json(config as never)} where id = ${params.id!} returning id, checkout_config, checkout_draft`;
        if (!offer) throw notFound("Oferta");
        await audit(tx, { auth, action: body.publish ? "offer.checkout_published" : "offer.checkout_draft_saved", target: offer.id });
        return { id: offer.id, published: resolveCheckoutConfig(offer.checkout_config), draft: offer.checkout_draft ? resolveCheckoutConfig(offer.checkout_draft) : null };
      }),
  );

  r.post(
    "/v1/offers/:id/bumps",
    {
      access: "account",
      tag: "Ofertas",
      summary: "Adicionar order bump (oferta extra marcada com um clique no checkout)",
      scope: "products:write",
      roles: ROLES_ADMIN,
      body: z.object({ bump_offer_id: z.uuid(), title: z.string().trim().min(3).max(120), description: z.string().trim().max(300).default("") }),
    },
    async ({ params, body, db, accountId }) => {
      const bump = await db(async (tx) => {
        const [offer] = await tx`select id from offers where id = ${params.id!}`;
        const [target] = await tx`select id from offers where id = ${body.bump_offer_id}`;
        if (!offer || !target) throw notFound("Oferta");
        if (offer.id === target.id) throw unprocessable("same_offer", "O order bump precisa ser outra oferta.");
        const [count] = await tx`select count(*) as n from order_bumps where offer_id = ${offer.id} and active`;
        if (count!.n >= 3) throw unprocessable("too_many_bumps", "Cada checkout aceita até 3 order bumps.");
        const [row] = await tx`
          insert into order_bumps (account_id, offer_id, bump_offer_id, title, description, position)
          values (${accountId}, ${offer.id}, ${target.id}, ${body.title}, ${body.description}, ${count!.n})
          on conflict (offer_id, bump_offer_id) do update set title = excluded.title, description = excluded.description, active = true
          returning *`;
        return row;
      });
      return created(bump);
    },
  );

  r.delete("/v1/bumps/:id", { access: "account", tag: "Ofertas", summary: "Remover order bump", scope: "products:write", roles: ROLES_ADMIN }, async ({ params, db }) => {
    await db((tx) => tx`update order_bumps set active = false where id = ${params.id!}`);
    return { ok: true };
  });

  // ── Cupons

  r.get("/v1/coupons", { access: "account", tag: "Cupons", summary: "Listar cupons", scope: "products:read" }, async ({ db }) => ({
    data: await db((tx) => tx`select * from coupons order by created_at desc`),
  }));

  r.post(
    "/v1/coupons",
    {
      access: "account",
      tag: "Cupons",
      summary: "Criar cupom (percentual ou valor fixo, com validade e limite de uso)",
      scope: "products:write",
      roles: ROLES_ADMIN,
      idempotent: true,
      body: z
        .object({
          code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Use só letras, números, - e _"),
          kind: z.enum(["percent", "fixed"]),
          value: z.number().int().positive(),
          product_id: z.uuid().optional(),
          expires_at: z.iso.datetime().optional(),
          max_uses: z.number().int().positive().optional(),
        })
        .refine((c) => c.kind === "fixed" || c.value <= 100, "O percentual vai de 1 a 100"),
    },
    async ({ body, db, accountId }) => {
      const coupon = await db(async (tx) => {
        const [dup] = await tx`select 1 from coupons where code = ${body.code.toUpperCase()}`;
        if (dup) throw unprocessable("coupon_exists", "Já existe um cupom com este código.");
        const [row] = await tx`
          insert into coupons (account_id, product_id, code, kind, value, expires_at, max_uses)
          values (${accountId}, ${body.product_id ?? null}, ${body.code.toUpperCase()}, ${body.kind}, ${body.value}, ${body.expires_at ?? null}, ${body.max_uses ?? null})
          returning *`;
        return row;
      });
      return created(coupon);
    },
  );

  r.delete("/v1/coupons/:id", { access: "account", tag: "Cupons", summary: "Desativar cupom", scope: "products:write", roles: ROLES_ADMIN }, async ({ params, db }) => {
    await db((tx) => tx`update coupons set active = false where id = ${params.id!}`);
    return { ok: true };
  });

  // ── Conteúdo (área de membros simples)

  r.post(
    "/v1/products/:id/modules",
    { access: "account", tag: "Conteúdo", summary: "Criar módulo", scope: "products:write", roles: ROLES_ADMIN, body: z.object({ title: z.string().trim().min(1).max(120) }) },
    async ({ params, body, db, accountId }) => {
      const row = await db(async (tx) => {
        const product = await getProduct(tx, params.id!);
        const [pos] = await tx`select coalesce(max(position) + 1, 0) as next from modules where product_id = ${product.id}`;
        const [mod] = await tx`insert into modules (account_id, product_id, title, position) values (${accountId}, ${product.id}, ${body.title}, ${pos!.next}) returning *`;
        return mod;
      });
      return created(row);
    },
  );

  const lessonInput = z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(5000).default(""),
    video_url: z.url().max(500).nullable().optional(),
    duration_seconds: z.number().int().min(0).max(86_400).nullable().optional(),
    release_after_days: z.number().int().min(0).max(3650).default(0),
  });

  r.post(
    "/v1/modules/:id/lessons",
    { access: "account", tag: "Conteúdo", summary: "Criar aula", scope: "products:write", roles: ROLES_ADMIN, body: lessonInput },
    async ({ params, body, db, accountId }) => {
      const row = await db(async (tx) => {
        const [mod] = await tx`select id, product_id from modules where id = ${params.id!}`;
        if (!mod) throw notFound("Módulo");
        const [pos] = await tx`select coalesce(max(position) + 1, 0) as next from lessons where module_id = ${mod.id}`;
        const [lesson] = await tx`
          insert into lessons (account_id, product_id, module_id, title, description, video_url, duration_seconds, position, release_after_days)
          values (${accountId}, ${mod.product_id}, ${mod.id}, ${body.title}, ${body.description}, ${body.video_url ?? null}, ${body.duration_seconds ?? null}, ${pos!.next}, ${body.release_after_days})
          returning *`;
        return lesson;
      });
      return created(row);
    },
  );

  r.patch(
    "/v1/lessons/:id",
    { access: "account", tag: "Conteúdo", summary: "Alterar aula", scope: "products:write", roles: ROLES_ADMIN, body: lessonInput.partial() },
    async ({ params, body, db }) =>
      db(async (tx) => {
        const [lesson] = await tx`select * from lessons where id = ${params.id!}`;
        if (!lesson) throw notFound("Aula");
        const [updated] = await tx`
          update lessons set title = ${body.title ?? lesson.title}, description = ${body.description ?? lesson.description},
            video_url = ${body.video_url === undefined ? lesson.video_url : body.video_url},
            duration_seconds = ${body.duration_seconds === undefined ? lesson.duration_seconds : body.duration_seconds},
            release_after_days = ${body.release_after_days ?? lesson.release_after_days}
          where id = ${lesson.id} returning *`;
        return updated;
      }),
  );

  r.delete("/v1/lessons/:id", { access: "account", tag: "Conteúdo", summary: "Excluir aula", scope: "products:write", roles: ROLES_ADMIN }, async ({ params, db }) => {
    await db((tx) => tx`delete from lessons where id = ${params.id!}`);
    return { ok: true };
  });

  // ── IA

  r.post(
    "/v1/ai/product-draft",
    {
      access: "account",
      tag: "IA",
      summary: "Gerar a proposta de produto a partir de uma descrição. Nada é salvo nem publicado: o produtor revisa e aprova.",
      roles: ROLES_ADMIN,
      body: z.object({ description: z.string().trim().min(10).max(2000) }),
    },
    async ({ body, accountId, system, auth }) => {
      // Limite de uso por conta, para o custo de IA não fugir do controle.
      limiter.check(`ai:${accountId}`, 20, 60 * 60_000);
      const draft = await generateProductDraft(config, body.description);
      await system((tx) => audit(tx, { auth, actorKind: "ai", action: "ai.product_draft", data: { source: draft.source } }));
      return draft;
    },
  );
}
