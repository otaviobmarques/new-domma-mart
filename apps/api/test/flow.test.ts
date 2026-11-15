import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { verifyWebhook } from "@domma/core/server";
import { withContext } from "@domma/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverOutbox } from "../src/services/notify.ts";
import { runDueReleases } from "../src/services/sales.ts";
import { deliverDueWebhooks } from "../src/services/webhooks.ts";
import { expireStalePayments } from "../src/worker.ts";
import { BUYER, type Harness, createHarness } from "./harness.ts";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

const DAY = 86_400_000;
const ledgerIsBalanced = async () => {
  const [row] = await h.system((tx) => tx`select coalesce(sum(amount_cents), 0) as total, (select coalesce(sum(balance_cents), 0) from ledger_accounts) as balances from ledger_entries`);
  expect(row!.total).toBe(0);
  expect(row!.balances).toBe(0);
};

describe("entrada sem senha", () => {
  it("cria a conta do produtor com código e não aceita código errado nem reutilizado", async () => {
    const signup = await h.api("POST", "/v1/auth/signup", { body: { name: "Ana Lima", email: "Ana@Example.com", phone: "11999990000" } });
    expect(signup.status).toBe(200);
    const wrong = await h.api("POST", "/v1/auth/verify", { body: { identifier: "ana@example.com", code: "000000" === signup.body.dev_code ? "111111" : "000000" } });
    expect(wrong.status).toBe(422);
    const ok = await h.api("POST", "/v1/auth/verify", { body: { identifier: "ana@example.com", code: signup.body.dev_code } });
    expect(ok.status).toBe(200);
    expect(ok.body.has_account).toBe(true);
    const again = await h.api("POST", "/v1/auth/verify", { body: { identifier: "ana@example.com", code: signup.body.dev_code } });
    expect(again.status).toBe(422);
    const me = await h.api("GET", "/v1/me", { token: ok.body.token });
    expect(me.body.accounts).toHaveLength(1);
    expect(me.body.accounts[0].role).toBe("owner");
  });

  it("responde igual para quem não tem cadastro e bloqueia depois de 5 erros", async () => {
    const unknown = await h.api("POST", "/v1/auth/code", { body: { identifier: "ninguem@example.com" } });
    expect(unknown.body).toEqual({ ok: true });
    await h.producer("travado@example.com");
    const sent = await h.api("POST", "/v1/auth/code", { body: { identifier: "travado@example.com" } });
    const wrongCode = sent.body.dev_code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await h.api("POST", "/v1/auth/verify", { body: { identifier: "travado@example.com", code: wrongCode } });
    const locked = await h.api("POST", "/v1/auth/verify", { body: { identifier: "travado@example.com", code: sent.body.dev_code } });
    expect(locked.status).toBe(422);
    expect(locked.body.error.message).toMatch(/Muitas tentativas/);
  });

  it("rotas protegidas exigem sessão", async () => {
    expect((await h.api("GET", "/v1/products")).status).toBe(401);
    expect((await h.api("GET", "/v1/products", { token: "dms_invalido" })).status).toBe(401);
  });
});

describe("venda por Pix, do checkout ao saque", () => {
  let producer: Awaited<ReturnType<Harness["producer"]>>;
  let product: Awaited<ReturnType<Harness["product"]>>;
  let order: { order_id: string; token: string };

  it("produtor publica um produto e ele já pode vender", async () => {
    producer = await h.producer("rafael@example.com");
    product = await h.product(producer.token);
    const checkout = await h.api("GET", `/v1/public/checkout/${product.slug}`);
    expect(checkout.status).toBe(200);
    expect(checkout.body.offer.price_cents).toBe(19700);
    expect(checkout.body.installments).toHaveLength(12);
    expect(checkout.body.product.guarantee_days).toBe(7);
  });

  it("produto com promessa de ganho garantido fica na fila de análise e não vende", async () => {
    const created = await h.api("POST", "/v1/products", {
      token: producer.token,
      body: { name: "Método de renda garantida em 7 dias", description: "Ganhe dinheiro fácil com lucro garantido todos os dias.", offer: { price_cents: 9700 } },
    });
    const published = await h.api("POST", `/v1/products/${created.body.id}/publish`, { token: producer.token });
    expect(published.body.status).toBe("in_review");
    expect(published.body.review_triage).toBe("reject");
    expect((await h.api("GET", `/v1/public/checkout/${created.body.offers[0].slug}`)).status).toBe(404);
  });

  it("valida os dados do comprador", async () => {
    const bad = await h.api("POST", `/v1/public/checkout/${product.slug}/orders`, { body: { buyer: { ...BUYER, cpf: "111.111.111-11" }, method: "pix" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/CPF/);
  });

  it("gera o Pix, confirma o pagamento e libera o acesso", async () => {
    const created = await h.api("POST", `/v1/public/checkout/${product.slug}/orders`, {
      body: { buyer: BUYER, method: "pix", utm: { utm_source: "instagram" } },
      headers: { "idempotency-key": "pedido-1" },
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("pending");
    expect(created.body.pix.copy_paste).toContain("SANDBOX");
    order = created.body;

    // A mesma requisição repetida devolve o mesmo pedido, sem cobrar duas vezes.
    const replay = await h.api("POST", `/v1/public/checkout/${product.slug}/orders`, {
      body: { buyer: BUYER, method: "pix", utm: { utm_source: "instagram" } },
      headers: { "idempotency-key": "pedido-1" },
    });
    expect(replay.body.order_id).toBe(order.order_id);
    const [count] = await h.system((tx) => tx`select count(*) as n from orders`);
    expect(count!.n).toBe(1);

    // Sem o token, ninguém acompanha o pedido.
    expect((await h.api("GET", `/v1/public/orders/${order.order_id}?token=errado`)).status).toBe(404);
    expect((await h.api("POST", `/v1/public/orders/${order.order_id}/access`, { body: { token: order.token } })).status).toBe(422);

    const paid = await h.api("POST", `/v1/sandbox/orders/${order.order_id}/pay`, { body: { token: order.token } });
    expect(paid.status).toBe(200);
    const status = await h.api("GET", `/v1/public/orders/${order.order_id}?token=${order.token}`);
    expect(status.body.status).toBe("paid");
    expect(status.body.buyer_first_name).toBe("Marina");

    // Pagar de novo não duplica nada.
    await h.api("POST", `/v1/sandbox/orders/${order.order_id}/pay`, { body: { token: order.token } });
    const [txs] = await h.system((tx) => tx`select count(*) as n from ledger_transactions where kind = 'sale'`);
    expect(txs!.n).toBe(1);
  });

  it("divide o dinheiro no livro-razão: conta nova tem 7 dias e 5% de reserva", async () => {
    const balance = await h.api("GET", "/v1/balance", { token: producer.token });
    // R$ 197,00 - R$ 1,49 = R$ 195,51 líquidos; 5% (R$ 9,78) reservados.
    expect(balance.body.available_cents).toBe(0);
    expect(balance.body.reserved_cents).toBe(978);
    expect(balance.body.pending_cents).toBe(19551 - 978);
    expect(balance.body.release.policy.tier).toBe("new");
    expect(balance.body.upcoming_releases).toHaveLength(2);
    const [revenue] = await h.system((tx) => tx`select balance_cents from ledger_accounts where account_id is null and kind = 'platform_revenue'`);
    expect(revenue!.balance_cents).toBe(149);
    await ledgerIsBalanced();

    const sale = await h.api("GET", `/v1/orders/${order.order_id}`, { token: producer.token });
    expect(sale.body).toMatchObject({ status: "paid", gross_cents: 19700, fee_cents: 149, net_cents: 19551, utm: { utm_source: "instagram" } });
    expect(sale.body.fee).toMatchObject({ method: "pix", fixedCents: 149 });
    const dash = await h.api("GET", "/v1/dashboard", { token: producer.token });
    expect(dash.body.today).toEqual({ total_cents: 19700, count: 1 });
    expect(dash.body.onboarding).toEqual({ has_product: true, identity_verified: false, has_sale: true });
  });

  it("comprador entra com o botão do checkout e só enxerga aquele pedido", async () => {
    const access = await h.api("POST", `/v1/public/orders/${order.order_id}/access`, { body: { token: order.token } });
    expect(access.status).toBe(200);
    const purchases = await h.api("GET", "/v1/buyer/purchases", { token: access.body.session_token });
    expect(purchases.body.restricted).toBe(true);
    expect(purchases.body.data).toHaveLength(1);
    expect(purchases.body.data[0]).toMatchObject({ can_access: true, guarantee_days_left: 7, can_request_refund: true });
    const content = await h.api("GET", `/v1/buyer/products/${product.id}/content`, { token: access.body.session_token });
    expect(content.body.modules[0].lessons).toHaveLength(2);
    // Sessão limitada não vira painel de produtor nem cria conta.
    expect((await h.api("GET", "/v1/products", { token: access.body.session_token })).status).toBe(403);
    expect((await h.api("POST", "/v1/account", { token: access.body.session_token, body: {} })).status).toBe(403);
  });

  it("o e-mail de acesso sai pela fila com link de uso único", async () => {
    const [msg] = await h.system((tx) => tx`select data from outbox_messages where template = 'access_granted' and recipient = ${BUYER.email}`);
    const token = (msg!.data.link as string).split("/acesso/")[1]!;
    const magic = await h.api("POST", "/v1/auth/magic", { body: { token } });
    expect(magic.status).toBe(200);
    expect(magic.body.redirect_to).toBe(`/assistir/${product.id}`);
    expect((await h.api("POST", "/v1/auth/magic", { body: { token } })).status).toBe(422);
    await deliverOutbox(h.deps, 100);
    const [sent] = await h.system((tx) => tx`select status, data from outbox_messages where template = 'access_granted' and recipient = ${BUYER.email}`);
    expect(sent!.status).toBe("sent");
    expect(sent!.data.link).toBeUndefined();
  });

  it("saque exige identidade verificada, código de confirmação e saldo disponível", async () => {
    const noKyc = await h.api("POST", "/v1/withdrawals", { token: producer.token, body: { amount_cents: 1000, confirmation_code: await h.confirmCode(producer.token, "withdrawal") } });
    expect(noKyc.status).toBe(422);
    expect(noKyc.body.error.code).toBe("identity_required");

    const kyc = await h.api("POST", "/v1/account/verification", { token: producer.token, body: { document: "529.982.247-25", pix_key: "rafael@example.com" } });
    expect(kyc.body.kyc_status).toBe("approved");
    // CPF e chave Pix ficam criptografados no banco.
    const [acc] = await h.system((tx) => tx`select document_enc, pix_key_enc from accounts where id = ${producer.accountId}`);
    expect(acc!.document_enc).toMatch(/^v1\./);
    expect(acc!.document_enc).not.toContain("52998224725");

    const noMoney = await h.api("POST", "/v1/withdrawals", { token: producer.token, body: { amount_cents: 1000, confirmation_code: await h.confirmCode(producer.token, "withdrawal") } });
    expect(noMoney.body.error.code).toBe("insufficient_balance");

    // 7 dias depois, o valor a liberar fica disponível sozinho; a reserva continua guardada.
    h.clock.now = new Date(Date.now() + 8 * DAY);
    expect(await runDueReleases(h.deps)).toBe(1);
    let balance = await h.api("GET", "/v1/balance", { token: producer.token });
    expect(balance.body).toMatchObject({ available_cents: 18573, pending_cents: 0, reserved_cents: 978 });

    const wrongCode = await h.api("POST", "/v1/withdrawals", { token: producer.token, body: { amount_cents: 10000, confirmation_code: "000000" } });
    expect(wrongCode.status).toBe(422);

    const w = await h.api("POST", "/v1/withdrawals", { token: producer.token, body: { amount_cents: 10000, confirmation_code: await h.confirmCode(producer.token, "withdrawal") } });
    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({ status: "completed", amount_cents: 10000, pix_key_masked: "ra•••@example.com" });
    balance = await h.api("GET", "/v1/balance", { token: producer.token });
    expect(balance.body.available_cents).toBe(8573);
    await ledgerIsBalanced();

    const statement = await h.api("GET", "/v1/transactions", { token: producer.token });
    expect(statement.body.data.map((t: any) => [t.kind, t.amount_cents])).toEqual([
      ["withdrawal", -10000],
      ["sale", 19551],
    ]);
  });

  it("trocar a chave Pix pausa os saques por 24 horas", async () => {
    const change = await h.api("PUT", "/v1/account/pix-key", { token: producer.token, body: { pix_key: "novo@example.com", confirmation_code: await h.confirmCode(producer.token, "pix_key") } });
    expect(change.status).toBe(200);
    // A troca é gravada com o relógio do banco; voltamos o relógio do teste para "agora".
    h.clock.now = null;
    const blocked = await h.api("POST", "/v1/withdrawals", { token: producer.token, body: { amount_cents: 1000, confirmation_code: await h.confirmCode(producer.token, "withdrawal") } });
    expect(blocked.body.error.code).toBe("pix_key_recently_changed");
    h.clock.now = new Date(Date.now() + 8 * DAY);
  });

  it("reembolso dentro da garantia é automático; depois do saque o saldo fica negativo", async () => {
    // Entra com o CPF usado na compra ("Encontrar minha compra").
    const sent = await h.api("POST", "/v1/auth/code", { body: { identifier: BUYER.cpf } });
    const login = await h.api("POST", "/v1/auth/verify", { body: { identifier: BUYER.cpf, code: sent.body.dev_code } });
    expect(login.status).toBe(200);
    const buyerToken = login.body.token;

    h.clock.now = new Date(Date.now() + 2 * DAY); // ainda na garantia
    const refund = await h.api("POST", `/v1/buyer/orders/${order.order_id}/refund`, { token: buyerToken, body: { reason: "Não era o que eu esperava" } });
    expect(refund.body.automatic).toBe(true);

    const timeline = await h.api("GET", `/v1/buyer/refunds/${refund.body.refund_id}`, { token: buyerToken });
    expect(timeline.body.status).toBe("completed"); // Pix devolvido no mesmo dia
    expect(timeline.body.events.map((e: any) => e.step)).toEqual(["requested", "approved", "sent", "available"]);
    expect(timeline.body.next).toBeNull();

    // Acesso cancelado, taxa devolvida, reserva usada e o que já tinha sido sacado vira saldo negativo.
    expect((await h.api("GET", `/v1/buyer/products/${product.id}/content`, { token: buyerToken })).status).toBe(404);
    const balance = await h.api("GET", "/v1/balance", { token: producer.token });
    expect(balance.body).toMatchObject({ available_cents: 8573 - 18573, reserved_cents: 0, pending_cents: 0 });
    const [revenue] = await h.system((tx) => tx`select balance_cents from ledger_accounts where account_id is null and kind = 'platform_revenue'`);
    expect(revenue!.balance_cents).toBe(0);
    await ledgerIsBalanced();

    const twice = await h.api("POST", `/v1/orders/${order.order_id}/refund`, { token: producer.token, body: {} });
    expect(twice.status).toBe(409);
    h.clock.now = null;
  });
});

describe("cartão", () => {
  it("aprova na hora, calcula juros do parcelamento e recusa com mensagem simples", async () => {
    const producer = await h.producer("cartao@example.com");
    const product = await h.product(producer.token);
    const buyer = { ...BUYER, email: "carlos@example.com", cpf: "111.444.777-35" };

    const refused = await h.api("POST", `/v1/public/checkout/${product.slug}/orders`, { body: { buyer, method: "card", card_token: "tok_test_insufficient_funds" } });
    expect(refused.body.status).toBe("refused");
    expect(refused.body.message).toMatch(/Tente outro cartão ou pague com Pix/);

    const approved = await h.api("POST", `/v1/public/checkout/${product.slug}/orders`, { body: { buyer, method: "card", card_token: "tok_test_approved", installments: 3 } });
    expect(approved.body.status).toBe("paid");
    const sale = await h.api("GET", `/v1/orders/${approved.body.order_id}`, { token: producer.token });
    // 3,99% + R$ 1,49 sobre R$ 197,00; os juros são pagos pelo comprador e não mudam o líquido.
    expect(sale.body).toMatchObject({ installments: 3, gross_cents: 19700, fee_cents: 935, net_cents: 18765, card_last4: "4242" });
    expect(sale.body.buyer_total_cents).toBeGreaterThan(19700);
    expect(sale.body.interest_cents).toBe(sale.body.buyer_total_cents - 19700);
    await ledgerIsBalanced();

    const list = await h.api("GET", "/v1/orders?period=today", { token: producer.token });
    expect(list.body.data.map((o: any) => o.status).sort()).toEqual(["paid", "refused"]);
    const search = await h.api("GET", `/v1/orders?q=${encodeURIComponent("111.444.777-35")}`, { token: producer.token });
    expect(search.body.data).toHaveLength(2);
  });
});

describe("cupom, order bump e Pix vencido", () => {
  it("soma o bump, aplica o cupom e libera os dois produtos", async () => {
    const producer = await h.producer("bump@example.com");
    const main = await h.product(producer.token);
    const extra = await h.product(producer.token, { name: "Planilha de planejamento", type: "file", offer: { price_cents: 2700 }, modules: [] });
    const bump = await h.api("POST", `/v1/offers/${main.offerId}/bumps`, { token: producer.token, body: { bump_offer_id: extra.offerId, title: "Leve também: Planilha de planejamento" } });
    expect(bump.status).toBe(201);
    await h.api("POST", "/v1/coupons", { token: producer.token, body: { code: "bemvindo", kind: "percent", value: 10, max_uses: 1 } });

    const quote = await h.api("POST", `/v1/public/checkout/${main.slug}/quote`, { body: { bump_ids: [bump.body.id], coupon_code: "BEMVINDO" } });
    expect(quote.body).toMatchObject({ items_cents: 22400, discount_cents: 2240, total_cents: 20160 });

    const buyer = { email: "julia@example.com", cpf: "390.533.447-05" };
    const order = await h.buyPix(main.slug, buyer, { bump_ids: [bump.body.id], coupon_code: "bemvindo" });
    const sale = await h.api("GET", `/v1/orders/${order.order_id}`, { token: producer.token });
    expect(sale.body).toMatchObject({ gross_cents: 20160, discount_cents: 2240 });
    expect(sale.body.items).toHaveLength(2);
    const [enrolled] = await h.system((tx) => tx`select count(*) as n from enrollments where order_id = ${order.order_id} and status = 'active'`);
    expect(enrolled!.n).toBe(2);

    // Cupom com limite de 1 uso não vale mais.
    const reuse = await h.api("POST", `/v1/public/checkout/${main.slug}/quote`, { body: { coupon_code: "BEMVINDO" } });
    expect(reuse.status).toBe(422);
  });

  it("Pix que passa da validade vence e não pode mais ser pago", async () => {
    const producer = await h.producer("vencido@example.com");
    const product = await h.product(producer.token);
    const order = await h.api("POST", `/v1/public/checkout/${product.slug}/orders`, { body: { buyer: { ...BUYER, email: "tarde@example.com" }, method: "pix" } });
    h.clock.now = new Date(Date.now() + 16 * 60_000);
    expect(await expireStalePayments(h.deps)).toBeGreaterThanOrEqual(1);
    h.clock.now = null;
    const status = await h.api("GET", `/v1/public/orders/${order.body.order_id}?token=${order.body.token}`);
    expect(status.body.status).toBe("expired");
    expect((await h.api("POST", `/v1/sandbox/orders/${order.body.order_id}/pay`, { body: { token: order.body.token } })).status).toBe(422);
  });
});

describe("isolamento entre contas", () => {
  it("uma conta nunca lê nem altera dados de outra — pela API e direto no banco", async () => {
    const a = await h.producer("conta-a@example.com");
    const b = await h.producer("conta-b@example.com");
    const product = await h.product(a.token);
    const order = await h.buyPix(product.slug, { email: "iso@example.com" });

    expect((await h.api("GET", "/v1/products", { token: b.token })).body.data).toHaveLength(0);
    expect((await h.api("GET", `/v1/products/${product.id}`, { token: b.token })).status).toBe(404);
    expect((await h.api("PATCH", `/v1/products/${product.id}`, { token: b.token, body: { name: "Invadido" } })).status).toBe(404);
    expect((await h.api("GET", `/v1/orders/${order.order_id}`, { token: b.token })).status).toBe(404);
    expect((await h.api("POST", `/v1/orders/${order.order_id}/refund`, { token: b.token, body: {} })).status).toBe(404);
    expect((await h.api("GET", "/v1/transactions", { token: b.token })).body.data).toHaveLength(0);
    // Tentar usar a conta de outra pessoa pelo cabeçalho é recusado.
    expect((await h.api("GET", "/v1/products", { token: b.token, headers: { "domma-account": a.accountId } })).status).toBe(403);

    // Mesmo com erro na aplicação (consulta sem filtro), o banco só devolve as linhas da própria conta.
    const asB = await withContext(h.sql, { kind: "account", accountId: b.accountId }, async (tx) => ({
      products: await tx`select id from products`,
      orders: await tx`select id from orders`,
      entries: await tx`select id from ledger_entries`,
      wallets: await tx`select id from ledger_accounts`,
      updated: await tx`update products set name = 'Invadido' where id = ${product.id} returning id`,
    }));
    expect(asB.products).toHaveLength(0);
    expect(asB.orders).toHaveLength(0);
    expect(asB.entries).toHaveLength(0);
    expect(asB.wallets).toHaveLength(3);
    expect(asB.updated).toHaveLength(0);
    // E sem contexto nenhum, nada aparece.
    expect(await h.sql`select id from products`).toHaveLength(0);
  });

  it("o livro-razão só aceita inclusão e só fecha em zero", async () => {
    await expect(h.system((tx) => tx`update ledger_entries set amount_cents = 1`)).rejects.toThrow();
    await expect(h.system((tx) => tx`delete from ledger_transactions`)).rejects.toThrow();
    await expect(h.system((tx) => tx`delete from audit_log`)).rejects.toThrow();
    // Lançamento de um lado só: o banco recusa no fim da transação.
    await expect(
      h.system(async (tx) => {
        const [t] = await tx`insert into ledger_transactions (kind, description) values ('adjustment', 'teste') returning id`;
        const [la] = await tx`select id from ledger_accounts where account_id is null and kind = 'platform_revenue'`;
        await tx`insert into ledger_entries (transaction_id, ledger_account_id, kind, amount_cents) values (${t!.id}, ${la!.id}, 'platform_revenue', 500)`;
      }),
    ).rejects.toThrow(/não fecha/);
    // Uma conta de produtor não consegue lançar no razão.
    const p = await h.producer("lancador@example.com");
    await expect(
      withContext(h.sql, { kind: "account", accountId: p.accountId }, (tx) => tx`insert into ledger_transactions (kind, account_id, description) values ('adjustment', ${p.accountId}, 'x')`),
    ).rejects.toThrow(/row-level security/);
    await ledgerIsBalanced();
  });
});

describe("plataforma aberta", () => {
  it("chave de API respeita os escopos e aparece completa uma única vez", async () => {
    const producer = await h.producer("api@example.com");
    const noCode = await h.api("POST", "/v1/api-keys", { token: producer.token, body: { name: "Site", scopes: ["products:read"], confirmation_code: "000000" } });
    expect(noCode.status).toBe(422);
    const created = await h.api("POST", "/v1/api-keys", { token: producer.token, body: { name: "Site", scopes: ["products:read"], confirmation_code: await h.confirmCode(producer.token, "api_key") } });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^dm_live_/);
    const listed = await h.api("GET", "/v1/api-keys", { token: producer.token });
    expect(JSON.stringify(listed.body)).not.toContain(created.body.key);

    expect((await h.api("GET", "/v1/products", { token: created.body.key })).status).toBe(200);
    const write = await h.api("POST", "/v1/products", { token: created.body.key, body: { name: "Produto", offer: { price_cents: 1000 } } });
    expect(write.status).toBe(403);
    // Saque e chaves nunca por chave de API.
    expect((await h.api("POST", "/v1/withdrawals", { token: created.body.key, body: { amount_cents: 100, confirmation_code: "123456" } })).status).toBe(403);
    expect((await h.api("GET", "/v1/api-keys", { token: created.body.key })).status).toBe(403);

    await h.api("DELETE", `/v1/api-keys/${created.body.id}`, { token: producer.token });
    expect((await h.api("GET", "/v1/products", { token: created.body.key })).status).toBe(401);
  });

  it("entrega webhooks assinados e agenda o reenvio quando o endereço falha", async () => {
    const received: { body: string; signature: string | undefined; event: string | undefined }[] = [];
    let fail = false;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, signature: req.headers["domma-signature"] as string, event: req.headers["domma-event"] as string });
        res.statusCode = fail ? 500 : 200;
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    try {
      const producer = await h.producer("hooks@example.com");
      const product = await h.product(producer.token);
      const hook = await h.api("POST", "/v1/webhooks", { token: producer.token, body: { url, events: ["order.paid"] } });
      expect(hook.body.secret).toMatch(/^whsec_/);

      await h.buyPix(product.slug, { email: "hook1@example.com" });
      await deliverDueWebhooks(h.deps, 50);
      expect(received).toHaveLength(1); // só o evento assinado; order.created e pix.generated não foram pedidos
      expect(received[0]!.event).toBe("order.paid");
      expect(verifyWebhook(received[0]!.body, received[0]!.signature, hook.body.secret)).toBe(true);
      expect(verifyWebhook(received[0]!.body, received[0]!.signature, "whsec_errado")).toBe(false);
      expect(JSON.parse(received[0]!.body).data.order.net_cents).toBe(19551);

      fail = true;
      await h.buyPix(product.slug, { email: "hook2@example.com" });
      await deliverDueWebhooks(h.deps, 50);
      const deliveries = await h.api("GET", `/v1/webhooks/${hook.body.id}/deliveries`, { token: producer.token });
      const failed = deliveries.body.data.find((d: any) => d.status === "pending");
      expect(failed).toMatchObject({ attempts: 1, last_status_code: 500 });
      expect(new Date(failed.next_attempt_at).getTime()).toBeGreaterThan(Date.now());

      fail = false;
      await h.api("POST", `/v1/webhook-deliveries/${failed.id}/resend`, { token: producer.token });
      await deliverDueWebhooks(h.deps, 50);
      expect(received).toHaveLength(3);
    } finally {
      server.close();
    }
  });

  it("documentação OpenAPI é gerada das rotas e não expõe o backoffice", async () => {
    const doc = await h.api("GET", "/v1/openapi.json");
    expect(doc.body.paths["/v1/products"].post.requestBody).toBeDefined();
    expect(doc.body.paths["/v1/orders/{id}/refund"].post["x-scope"]).toBe("orders:write");
    expect(Object.keys(doc.body.paths).some((p) => p.includes("backoffice"))).toBe(false);
  });
});

describe("backoffice e segurança do comprador", () => {
  it("só a equipe Domma decide a fila, e toda decisão fica registrada com motivo", async () => {
    const producer = await h.producer("duvida@example.com");
    const created = await h.api("POST", "/v1/products", {
      token: producer.token,
      body: { name: "Mentoria de emagrecimento", description: "Acompanhamento em grupo para emagrecer com hábitos simples.", type: "service", offer: { price_cents: 49700 } },
    });
    const published = await h.api("POST", `/v1/products/${created.body.id}/publish`, { token: producer.token });
    expect(published.body).toMatchObject({ status: "in_review", review_triage: "doubt" });

    expect((await h.api("GET", "/v1/backoffice/queue", { token: producer.token })).status).toBe(403);
    const staff = await h.producer("equipe@domma.test", "Equipe Domma");
    const queue = await h.api("GET", "/v1/backoffice/queue", { token: staff.token });
    expect(queue.body.products.some((p: any) => p.id === created.body.id)).toBe(true);

    const noReason = await h.api("POST", `/v1/backoffice/products/${created.body.id}/decision`, { token: staff.token, body: { decision: "reject" } });
    expect(noReason.status).toBe(400);
    const decision = await h.api("POST", `/v1/backoffice/products/${created.body.id}/decision`, { token: staff.token, body: { decision: "approve" } });
    expect(decision.body.status).toBe("approved");
    const [log] = await h.system((tx) => tx`select actor_user_id, actor_kind from audit_log where action = 'product.review.approve' and target = ${created.body.id}`);
    expect(log).toMatchObject({ actor_user_id: staff.userId, actor_kind: "backoffice" });
  });

  it("confere se um link de pagamento é verdadeiro", async () => {
    const producer = await h.producer("links@example.com");
    const product = await h.product(producer.token);
    const real = await h.api("POST", "/v1/public/verify-link", { body: { url: `http://localhost:3000/c/${product.slug}` } });
    expect(real.body).toMatchObject({ genuine: true, seller: "Rafael O." });
    const fake = await h.api("POST", "/v1/public/verify-link", { body: { url: `https://domma-mart-pagamentos.com/c/${product.slug}` } });
    expect(fake.body).toEqual({ genuine: false });
    expect((await h.api("POST", "/v1/public/report-link", { body: { url: "https://domma-mart-pagamentos.com/c/x" } })).status).toBe(200);
  });

  it("comprar com o e-mail de outra pessoa não dá acesso às compras dela", async () => {
    const producer = await h.producer("vitima-prod@example.com");
    const product = await h.product(producer.token);
    const other = await h.product(producer.token, { name: "Outro curso da vítima" });
    await h.buyPix(other.slug, { email: "vitima@example.com", cpf: "168.995.350-09" });
    // O atacante compra usando o e-mail da vítima e outros dados.
    const attack = await h.buyPix(product.slug, { name: "Atacante Silva", email: "vitima@example.com", cpf: "390.533.447-05", phone: "(21) 90000-0000" });
    const access = await h.api("POST", `/v1/public/orders/${attack.order_id}/access`, { body: { token: attack.token } });
    const purchases = await h.api("GET", "/v1/buyer/purchases", { token: access.body.session_token });
    expect(purchases.body.data).toHaveLength(1);
    expect(purchases.body.data[0].order_id).toBe(attack.order_id);
    expect((await h.api("GET", `/v1/buyer/products/${other.id}/content`, { token: access.body.session_token })).status).toBe(404);
    // E os dados cadastrados da vítima não são trocados pelo checkout.
    const [victim] = await h.system((tx) => tx`select name, phone from users where email = 'vitima@example.com'`);
    expect(victim).toMatchObject({ name: "Marina Souza", phone: "(11) 98765-4321" });
  });
});

describe("atendimento humano com prazo", () => {
  it("o comprador abre um pedido, vê o prazo de 1 dia útil e recebe a resposta da equipe", async () => {
    const producer = await h.producer("suporte-prod@example.com");
    const product = await h.product(producer.token);
    const order = await h.buyPix(product.slug, { email: "ajuda@example.com", cpf: "168.995.350-09" });
    const access = await h.api("POST", `/v1/public/orders/${order.order_id}/access`, { body: { token: order.token } });
    const buyer = access.body.session_token;

    // Sexta-feira à tarde: o prazo cai na segunda, não no sábado.
    h.clock.now = new Date("2026-11-20T18:00:00Z");
    const short = await h.api("POST", "/v1/buyer/support", { token: buyer, body: { topic: "access", message: "ajuda" } });
    expect(short.status).toBe(400);
    const ticket = await h.api("POST", "/v1/buyer/support", { token: buyer, body: { topic: "access", message: "Não consigo abrir a segunda aula do curso.", order_id: order.order_id } });
    expect(ticket.status).toBe(200);
    expect(ticket.body.due_at).toBe("2026-11-23T21:00:00.000Z"); // segunda, 18h de Brasília
    h.clock.now = null;

    const staff = await h.producer("equipe@domma.test", "Equipe Domma");
    const queue = await h.api("GET", "/v1/backoffice/queue", { token: staff.token });
    expect(queue.body.tickets.map((t: any) => t.id)).toContain(ticket.body.id);
    expect((await h.api("POST", `/v1/backoffice/tickets/${ticket.body.id}/answer`, { token: producer.token, body: { answer: "Tentativa indevida" } })).status).toBe(403);
    const answered = await h.api("POST", `/v1/backoffice/tickets/${ticket.body.id}/answer`, { token: staff.token, body: { answer: "A aula foi liberada. Pode tentar de novo." } });
    expect(answered.status).toBe(200);

    const mine = await h.api("GET", "/v1/buyer/support", { token: buyer });
    expect(mine.body.data[0]).toMatchObject({ status: "answered", answer: "A aula foi liberada. Pode tentar de novo.", product_name: "Curso Exemplo: do zero à primeira venda" });

    // Busca de contas e bloqueio de saque com motivo por escrito.
    const accounts = await h.api("GET", "/v1/backoffice/accounts?q=suporte-prod", { token: staff.token });
    expect(accounts.body.data).toHaveLength(1);
    const noReason = await h.api("POST", `/v1/backoffice/accounts/${producer.accountId}/withdrawals-block`, { token: staff.token, body: { blocked: true, reason: "" } });
    expect(noReason.status).toBe(400);
    await h.api("POST", `/v1/backoffice/accounts/${producer.accountId}/withdrawals-block`, { token: staff.token, body: { blocked: true, reason: "Pico de reembolsos em análise" } });
    const balance = await h.api("GET", "/v1/balance", { token: producer.token });
    expect(balance.body.withdrawals_blocked_reason).toBe("Pico de reembolsos em análise");
  });
});
