import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, createHarness } from "./harness.ts";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

const wallet = async (token: string) => {
  const b = (await h.api("GET", "/v1/balance", { token })).body;
  return { total: b.pending_cents + b.reserved_cents + b.available_cents + b.disputed_cents, available: b.available_cents, disputed: b.disputed_cents };
};
const ledgerSum = async () => (await h.system((tx) => tx`select coalesce(sum(amount_cents), 0) as total from ledger_entries`))[0]!.total;
const program = (token: string, productId: string, body: Record<string, unknown>) =>
  h.api("PUT", `/v1/products/${productId}/affiliate-program`, { token, body: { mode: "open", commission_type: "percent", commission_bps: 4000, ...body } });
const codeOf = (link: string) => new URL(link).searchParams.get("ref")!;

describe("afiliados (M05, P10, A01)", () => {
  it("programa aberto: o link sai na hora e a venda divide o dinheiro sozinha", async () => {
    const producer = await h.producer("af-produtor@example.com", "Paula Produtora");
    const affiliate = await h.producer("af-afiliado@example.com", "Alex Afiliado");
    const product = await h.product(producer.token);

    // Programa fechado: o produto não aparece para afiliados.
    expect((await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token })).body.discover).toHaveLength(0);
    expect((await h.api("POST", `/v1/affiliate/products/${product.id}/join`, { token: affiliate.token })).status).toBe(404);
    expect((await program(producer.token, product.id, { commission_bps: 50 })).body.error.code).toBe("commission_too_low");
    expect((await program(affiliate.token, product.id, {})).status).toBe(404);
    expect((await program(producer.token, product.id, {})).status).toBe(200);

    const portal = await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token });
    // R$ 197,00 com 40% de comissão: o afiliado ganha R$ 78,80 por venda.
    expect(portal.body.discover).toMatchObject([{ product_id: product.id, seller_name: "Paula Produtora", price_cents: 19700, earn_cents: 7880, mode: "open" }]);
    expect((await h.api("GET", "/v1/affiliate/portal", { token: producer.token })).body.discover).toHaveLength(0);
    expect((await h.api("POST", `/v1/affiliate/products/${product.id}/join`, { token: producer.token })).body.error.code).toBe("own_product");

    const joined = await h.api("POST", `/v1/affiliate/products/${product.id}/join`, { token: affiliate.token });
    expect(joined.status).toBe(201);
    expect(joined.body.link).toContain(`/c/${product.slug}?ref=`);
    expect((await h.api("POST", `/v1/affiliate/products/${product.id}/join`, { token: affiliate.token })).body.error.code).toBe("already_joined");
    const ref = codeOf(joined.body.link);

    const click = await h.api("POST", `/v1/public/affiliate-links/${ref}/click`, { body: {} });
    expect(click.body).toEqual({ valid: true, product_id: product.id, attribution: "last", days: 30 });
    expect((await h.api("POST", "/v1/public/affiliate-links/naoexiste/click", { body: {} })).body).toEqual({ valid: false });

    const order = await h.buyPix(product.slug, { email: "af-compradora@example.com" }, { ref });
    const sale = (await h.api("GET", `/v1/orders/${order.order_id}`, { token: producer.token })).body;
    // Líquido de R$ 195,51 (taxa de R$ 1,49): R$ 78,80 para o afiliado e R$ 116,71 para o produtor.
    expect(sale).toMatchObject({ fee_cents: 149, commissions_cents: 7880, net_cents: 11671, splits: [{ role: "affiliate", amount_cents: 7880 }] });
    expect((await wallet(producer.token)).total).toBe(11671);
    expect((await wallet(affiliate.token)).total).toBe(7880);
    expect(await ledgerSum()).toBe(0);
    // O afiliado não enxerga o pedido nem os dados do comprador.
    expect((await h.api("GET", `/v1/orders/${order.order_id}`, { token: affiliate.token })).status).toBe(404);

    const mine = (await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token })).body;
    expect(mine.month_commission_cents).toBe(7880);
    expect(mine.mine[0]).toMatchObject({ status: "approved", clicks: 1, sales: 1, commission_cents_total: 7880, earn_cents: 7880 });
    expect(mine.recent[0]).toMatchObject({ amount_cents: 7880, role: "affiliate", status: "paid" });
    const managed = (await h.api("GET", "/v1/affiliates", { token: producer.token })).body.products.find((p: any) => p.id === product.id);
    expect(managed.affiliates[0]).toMatchObject({ affiliate_name: "Alex Afiliado", sales: 1, commission_cents_total: 7880, clicks: 1 });

    // Sem link, com link inválido ou comprando pelo próprio link: sem comissão.
    for (const [email, extra] of [["af-direto@example.com", {}], ["af-invalido@example.com", { ref: "codigo-que-nao-existe" }], ["af-afiliado@example.com", { ref }]] as const) {
      const o = await h.buyPix(product.slug, { email, cpf: "111.444.777-35" }, extra);
      expect((await h.api("GET", `/v1/orders/${o.order_id}`, { token: producer.token })).body.commissions_cents).toBe(0);
    }

    // Reembolso devolve a fatia de cada um; a comissão sai da carteira do afiliado.
    expect((await h.api("POST", `/v1/orders/${order.order_id}/refund`, { token: producer.token, body: {} })).status).toBe(200);
    expect((await wallet(affiliate.token)).total).toBe(0);
    expect((await wallet(producer.token)).total).toBe(19551 * 3);
    expect(await ledgerSum()).toBe(0);
    expect((await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token })).body.month_commission_cents).toBe(0);
  });

  it("programa com aprovação, comissão própria, bloqueio e contestação", async () => {
    const producer = await h.producer("af2-produtor@example.com", "Paula Produtora");
    const affiliate = await h.producer("af2-afiliado@example.com", "Alex Afiliado");
    const staff = await h.producer("equipe@domma.test", "Equipe Domma");
    const product = await h.product(producer.token);
    await program(producer.token, product.id, { mode: "approval", commission_type: "fixed", commission_cents: 5000, attribution: "first", cookie_days: 60, materials: [{ title: "Banner", url: "https://exemplo.com/banner.png" }] });

    const joined = await h.api("POST", `/v1/affiliate/products/${product.id}/join`, { token: affiliate.token });
    expect(joined.body).toMatchObject({ status: "pending", link: null });
    const before = (await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token })).body.mine[0];
    expect(before).toMatchObject({ status: "pending", link: null, materials: [], earn_cents: 5000 });
    const list = await h.api("GET", "/v1/affiliates", { token: producer.token });
    expect(list.body.pending).toBe(1);
    const affiliationId = list.body.products[0].affiliates[0].id;
    const ref = (await h.system((tx) => tx`select code from affiliations where id = ${affiliationId}`))[0]!.code;

    // Enquanto o pedido está pendente, o link não vale comissão.
    const early = await h.buyPix(product.slug, { email: "af2-a@example.com" }, { ref });
    expect((await h.api("GET", `/v1/orders/${early.order_id}`, { token: producer.token })).body.commissions_cents).toBe(0);
    // Só o dono do produto decide.
    expect((await h.api("POST", `/v1/affiliations/${affiliationId}/decision`, { token: affiliate.token, body: { decision: "approve" } })).status).toBe(404);
    expect((await h.api("POST", `/v1/affiliations/${affiliationId}/decision`, { token: producer.token, body: { decision: "approve" } })).status).toBe(200);
    const after = (await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token })).body.mine[0];
    expect(after.link).toContain(ref);
    expect(after.materials).toEqual([{ title: "Banner", url: "https://exemplo.com/banner.png" }]);
    expect((await h.api("POST", `/v1/public/affiliate-links/${ref}/click`, { body: {} })).body).toMatchObject({ attribution: "first", days: 60 });

    const fixed = await h.buyPix(product.slug, { email: "af2-b@example.com", cpf: "111.444.777-35" }, { ref });
    expect((await h.api("GET", `/v1/orders/${fixed.order_id}`, { token: producer.token })).body).toMatchObject({ commissions_cents: 5000, net_cents: 14551 });

    // Comissão própria vale só para as próximas vendas.
    expect((await h.api("PATCH", `/v1/affiliations/${affiliationId}`, { token: producer.token, body: { commission_type: "percent", commission_bps: 5000 } })).status).toBe(200);
    expect((await h.api("GET", `/v1/orders/${fixed.order_id}`, { token: producer.token })).body.commissions_cents).toBe(5000);
    const own = await h.buyPix(product.slug, { email: "af2-c@example.com", cpf: "390.533.447-05" }, { ref });
    expect((await h.api("GET", `/v1/orders/${own.order_id}`, { token: producer.token })).body.commissions_cents).toBe(9850);
    expect((await wallet(affiliate.token)).total).toBe(14850);

    // Contestação separa a fatia de cada um; perdida, sai das duas carteiras.
    await h.api("POST", `/v1/backoffice/sandbox/orders/${own.order_id}/chargeback`, { token: staff.token, body: {} });
    expect(await wallet(affiliate.token)).toMatchObject({ total: 14850, disputed: 9850 });
    expect((await wallet(producer.token)).disputed).toBe(19551 - 9850);
    const cb = (await h.api("GET", "/v1/backoffice/risk", { token: staff.token })).body.chargebacks.find((c: any) => c.order_id === own.order_id);
    await h.api("POST", `/v1/backoffice/chargebacks/${cb.id}/defense`, { token: staff.token });
    await h.api("POST", `/v1/backoffice/chargebacks/${cb.id}/result`, { token: staff.token, body: { result: "lost" } });
    expect(await wallet(affiliate.token)).toMatchObject({ total: 5000, disputed: 0 });
    expect(await ledgerSum()).toBe(0);

    // Bloqueado: o link para de valer.
    await h.api("POST", `/v1/affiliations/${affiliationId}/decision`, { token: producer.token, body: { decision: "block" } });
    expect((await h.api("POST", `/v1/public/affiliate-links/${ref}/click`, { body: {} })).body.valid).toBe(false);
    const blocked = await h.buyPix(product.slug, { email: "af2-d@example.com", cpf: "168.995.350-09" }, { ref });
    expect((await h.api("GET", `/v1/orders/${blocked.order_id}`, { token: producer.token })).body.commissions_cents).toBe(0);
    expect((await h.api("GET", "/v1/affiliate/portal", { token: affiliate.token })).body.mine[0]).toMatchObject({ status: "blocked", link: null });
  });
});

describe("coprodução", () => {
  it("só divide depois do aceite, respeita a vigência e soma com o afiliado", async () => {
    const producer = await h.producer("co-produtor@example.com", "Paula Produtora");
    const partner = await h.producer("co-parceiro@example.com", "Caio Coprodutor");
    const affiliate = await h.producer("co-afiliado@example.com", "Alex Afiliado");
    const product = await h.product(producer.token);
    const invite = (body: Record<string, unknown>, token = producer.token) => h.api("POST", `/v1/products/${product.id}/coproducers`, { token, body });

    expect((await invite({ email: "ninguem@example.com", percent_bps: 3000 })).body.error.code).toBe("coproducer_not_found");
    expect((await invite({ email: "co-produtor@example.com", percent_bps: 3000 })).body.error.code).toBe("coproducer_self");
    expect((await invite({ email: "co-parceiro@example.com", percent_bps: 9500 })).status).toBe(400);
    expect((await invite({ email: "co-parceiro@example.com", percent_bps: 3000 }, partner.token)).status).toBe(404);
    const invited = await invite({ email: "Co-Parceiro@example.com", percent_bps: 3000 });
    expect(invited.status).toBe(201);
    expect((await invite({ email: "co-parceiro@example.com", percent_bps: 1000 })).body.error.code).toBe("already_coproducer");
    expect((await invite({ email: "co-afiliado@example.com", percent_bps: 7000 })).body.error.code).toBe("too_much");

    // Convite ainda não aceito: nada é dividido.
    const early = await h.buyPix(product.slug, { email: "co-a@example.com" });
    expect((await h.api("GET", `/v1/orders/${early.order_id}`, { token: producer.token })).body.commissions_cents).toBe(0);
    const inbox = (await h.api("GET", "/v1/affiliate/portal", { token: partner.token })).body.coproductions;
    expect(inbox).toMatchObject([{ id: invited.body.id, status: "invited", percent_bps: 3000, product_name: "Curso Exemplo: do zero à primeira venda", seller_name: "Paula Produtora" }]);
    // Só o convidado responde.
    expect((await h.api("POST", `/v1/coproductions/${invited.body.id}/respond`, { token: producer.token, body: { accept: true } })).status).toBe(404);
    expect((await h.api("POST", `/v1/coproductions/${invited.body.id}/respond`, { token: partner.token, body: { accept: true } })).body.status).toBe("accepted");

    // Sem afiliado: 30% do líquido (R$ 195,51) = R$ 58,65.
    const plain = await h.buyPix(product.slug, { email: "co-b@example.com", cpf: "111.444.777-35" });
    expect((await h.api("GET", `/v1/orders/${plain.order_id}`, { token: producer.token })).body).toMatchObject({ commissions_cents: 5865, net_cents: 13686, splits: [{ role: "coproducer", amount_cents: 5865 }] });
    expect((await wallet(partner.token)).total).toBe(5865);

    // Com afiliado de 40%: R$ 78,80 para ele; dos R$ 116,71 que sobram, 30% (R$ 35,01) para o coprodutor.
    await program(producer.token, product.id, {});
    const ref = codeOf((await h.api("POST", `/v1/affiliate/products/${product.id}/join`, { token: affiliate.token })).body.link);
    const both = await h.buyPix(product.slug, { email: "co-c@example.com", cpf: "390.533.447-05" }, { ref });
    const sale = (await h.api("GET", `/v1/orders/${both.order_id}`, { token: producer.token })).body;
    expect(sale.splits.map((s: any) => [s.role, s.amount_cents])).toEqual([["affiliate", 7880], ["coproducer", 3501]]);
    expect(sale.net_cents).toBe(19551 - 7880 - 3501);
    expect((await wallet(partner.token)).total).toBe(5865 + 3501);
    expect(await ledgerSum()).toBe(0);
    expect((await h.api("GET", "/v1/affiliates", { token: producer.token })).body.products[0].coproducers[0]).toMatchObject({ coproducer_name: "Caio Coprodutor", status: "accepted", paid_cents_total: 9366 });

    // Vigência vencida ou coprodução encerrada: as próximas vendas não dividem mais.
    await h.system((tx) => tx`update coproductions set ends_at = now() - interval '1 day' where id = ${invited.body.id}`);
    const expired = await h.buyPix(product.slug, { email: "co-d@example.com", cpf: "168.995.350-09" });
    expect((await h.api("GET", `/v1/orders/${expired.order_id}`, { token: producer.token })).body.commissions_cents).toBe(0);
    expect((await h.api("DELETE", `/v1/coproductions/${invited.body.id}`, { token: partner.token })).status).toBe(200);
    expect((await h.api("GET", "/v1/affiliate/portal", { token: partner.token })).body.coproductions).toHaveLength(0);
    // O que já foi vendido continua dele.
    expect((await wallet(partner.token)).total).toBe(9366);
  });
});
