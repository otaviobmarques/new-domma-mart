import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_TABLE,
  classifyIdentifier,
  computeSale,
  formatBRL,
  installmentOptions,
  isValidCnpj,
  isValidCpf,
  parseBRL,
  percentOf,
  planRelease,
  refundPostings,
  releaseDate,
  resolveFeeTable,
  resolveReleasePolicy,
  salePostings,
  affiliateCommission,
  chargebackLostPostings,
  chargebackLostSplitPostings,
  chargebackOpenedPostings,
  chargebackOpenedSplitPostings,
  computeSplit,
  refundSplitPostings,
  saleSplitPostings,
  chargebackWonPostings,
  withdrawalPostings,
} from "./index.ts";
import { SandboxProvider, blindIndex, decryptField, encryptField, signWebhook, verifyWebhook } from "./server.ts";

describe("dinheiro", () => {
  it("formata e lê reais", () => {
    expect(formatBRL(19700)).toBe("R$ 197,00");
    expect(formatBRL(421050)).toBe("R$ 4.210,50");
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
    expect(parseBRL("197")).toBe(19700);
    expect(parseBRL("197,5")).toBe(19750);
    expect(parseBRL("abc")).toBeNull();
  });
  it("arredonda percentual meio centavo para cima", () => {
    expect(percentOf(19700, 399)).toBe(786); // 786,03
    expect(percentOf(12550, 100)).toBe(126); // 125,5 -> 126
  });
});

describe("documentos", () => {
  it("valida CPF e CNPJ", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });
  it("classifica o campo único de entrada", () => {
    expect(classifyIdentifier(" Marina@Email.com ")).toEqual({ kind: "email", value: "marina@email.com" });
    expect(classifyIdentifier("529.982.247-25")).toEqual({ kind: "cpf", value: "52998224725" });
    expect(classifyIdentifier("(11) 98765-4321")).toEqual({ kind: "phone", value: "11987654321" });
    expect(classifyIdentifier("123")).toBeNull();
  });
});

describe("motor de taxas (12.2)", () => {
  it("Pix: R$ 1,49 fixo — bate com o extrato do protótipo P09", () => {
    const sale = computeSale({ method: "pix", priceCents: 19700 }, DEFAULT_FEE_TABLE);
    expect(sale.feeCents).toBe(149);
    expect(sale.netCents).toBe(19551); // "+ R$ 195,51"
    expect(sale.buyerTotalCents).toBe(19700);
    expect(sale.platformRevenueCents).toBe(149);
  });
  it("cartão à vista: 3,99% + R$ 1,49", () => {
    const sale = computeSale({ method: "card", priceCents: 19700 }, DEFAULT_FEE_TABLE);
    expect(sale.feeCents).toBe(786 + 149);
    expect(sale.netCents).toBe(19700 - 935);
    expect(sale.interestCents).toBe(0);
  });
  it("parcelado com juros pagos pelo comprador: produtor recebe o mesmo que à vista", () => {
    const avista = computeSale({ method: "card", priceCents: 19700 }, DEFAULT_FEE_TABLE);
    const sale = computeSale({ method: "card", priceCents: 19700, installments: 12 }, DEFAULT_FEE_TABLE);
    expect(sale.netCents).toBe(avista.netCents);
    expect(sale.buyerTotalCents).toBeGreaterThan(19700);
    expect(sale.buyerTotalCents % 12).toBe(0);
    expect(sale.platformRevenueCents).toBe(sale.feeCents + sale.interestCents);
    expect(sale.buyerTotalCents).toBe(sale.netCents + sale.platformRevenueCents);
  });
  it("parcelado com juros assumidos pelo produtor: comprador paga o preço cheio", () => {
    const sale = computeSale({ method: "card", priceCents: 19700, installments: 6, interestPayer: "producer" }, DEFAULT_FEE_TABLE);
    expect(sale.buyerTotalCents).toBe(19700);
    expect(sale.netCents).toBe(19700 - sale.feeCents - sale.interestCents);
  });
  it("taxa nunca passa do valor da venda", () => {
    const sale = computeSale({ method: "pix", priceCents: 100 }, DEFAULT_FEE_TABLE);
    expect(sale.feeCents).toBe(100);
    expect(sale.netCents).toBe(0);
  });
  it("lista parcelas respeitando o limite da oferta e a parcela mínima", () => {
    const opts = installmentOptions(19700, DEFAULT_FEE_TABLE, { max: 6 });
    expect(opts).toHaveLength(6);
    expect(opts[0]).toMatchObject({ installments: 1, totalCents: 19700, interestCents: 0 });
    expect(opts[5]!.totalCents).toBe(opts[5]!.installmentCents * 6);
    expect(installmentOptions(1200, DEFAULT_FEE_TABLE)).toHaveLength(2);
  });
  it("condição própria da conta sobrepõe só o que foi informado", () => {
    const table = resolveFeeTable(DEFAULT_FEE_TABLE, { card: { percentBps: 299, fixedCents: 149 } });
    expect(table.card.percentBps).toBe(299);
    expect(table.pix.fixedCents).toBe(149);
  });
});

describe("liberação e reserva (12.4)", () => {
  const paidAt = new Date("2026-11-15T20:48:00Z"); // 17:48 em Brasília
  it("conta nova: 7 dias e reserva de 5% por 30 dias", () => {
    const policy = resolveReleasePolicy({ accountAgeDays: 3, refundRateBps: 0, chargebackRateBps: 0 });
    expect(policy).toMatchObject({ tier: "new", pixReleaseDays: 7, cardReleaseDays: 7, reserveBps: 500 });
    const plan = planRelease(19551, "pix", paidAt, policy);
    expect(plan.reserveCents).toBe(978);
    expect(plan.pendingCents).toBe(19551 - 978);
    expect(plan.releaseAt.toISOString()).toBe("2026-11-22T03:00:00.000Z");
    expect(plan.reserveReleaseAt.toISOString()).toBe("2026-12-15T03:00:00.000Z");
  });
  it("de 30 a 90 dias: Pix no dia seguinte, cartão em 15 dias, reserva de 5%", () => {
    const policy = resolveReleasePolicy({ accountAgeDays: 45, refundRateBps: 0, chargebackRateBps: 0 });
    expect(policy).toMatchObject({ tier: "growing", pixReleaseDays: 1, cardReleaseDays: 15, reserveBps: 500 });
  });
  it("mais de 90 dias com bons indicadores: sem reserva", () => {
    const policy = resolveReleasePolicy({ accountAgeDays: 120, refundRateBps: 210, chargebackRateBps: 20 });
    expect(policy).toMatchObject({ tier: "trusted", reserveBps: 0 });
    expect(planRelease(19551, "pix", paidAt, policy).releaseAt.toISOString()).toBe("2026-11-16T03:00:00.000Z");
  });
  it("mais de 90 dias com reembolso alto continua com reserva", () => {
    expect(resolveReleasePolicy({ accountAgeDays: 120, refundRateBps: 800, chargebackRateBps: 0 }).reserveBps).toBe(500);
  });
  it("backoffice pode definir condição própria", () => {
    const policy = resolveReleasePolicy({ accountAgeDays: 5, refundRateBps: 0, chargebackRateBps: 0 }, undefined, { reserveBps: 1500 });
    expect(policy).toMatchObject({ tier: "custom", reserveBps: 1500, pixReleaseDays: 7 });
  });
  it("o dia vira no horário de Brasília", () => {
    expect(releaseDate(new Date("2026-11-16T02:30:00Z"), 1).toISOString()).toBe("2026-11-16T03:00:00.000Z");
  });
});

describe("livro-razão", () => {
  const sum = (ps: { amountCents: number }[]) => ps.reduce((a, p) => a + p.amountCents, 0);
  it("venda fecha em zero e separa receita, a liberar e reserva", () => {
    const ps = salePostings({ accountId: "a", buyerTotalCents: 19700, netCents: 19551, reserveCents: 978 });
    expect(sum(ps)).toBe(0);
    expect(ps.find((p) => p.kind === "platform_revenue")!.amountCents).toBe(149);
    expect(ps.find((p) => p.kind === "pending")!.amountCents).toBe(18573);
  });
  it("reembolso depois do saque deixa o disponível negativo", () => {
    const ps = refundPostings({ accountId: "a", buyerTotalCents: 19700, netCents: 19551, unreleasedPendingCents: 0, unreleasedReserveCents: 978 });
    expect(sum(ps)).toBe(0);
    expect(ps.find((p) => p.kind === "available")!.amountCents).toBe(-(19551 - 978));
    expect(ps.find((p) => p.kind === "platform_revenue")!.amountCents).toBe(-149);
  });
  it("contestação: separa o líquido, devolve se ganhar e estorna tudo se perder", () => {
    const opened = chargebackOpenedPostings({ accountId: "a", netCents: 18765, unreleasedPendingCents: 17827, unreleasedReserveCents: 938 });
    expect(sum(opened)).toBe(0);
    expect(opened.find((p) => p.kind === "disputed")!.amountCents).toBe(18765);
    expect(opened.some((p) => p.kind === "available")).toBe(false);
    expect(sum(chargebackWonPostings({ accountId: "a", netCents: 18765 }))).toBe(0);
    const lost = chargebackLostPostings({ accountId: "a", buyerTotalCents: 20892, netCents: 18765 });
    expect(sum(lost)).toBe(0);
    expect(lost.find((p) => p.kind === "provider_clearing")!.amountCents).toBe(20892);
    expect(lost.find((p) => p.kind === "platform_revenue")!.amountCents).toBe(-(20892 - 18765));
  });
  it("divide a venda entre afiliado, coprodutores e produtor sem sobrar nem faltar centavo", () => {
    // Venda de R$ 197,00 no Pix: líquido de R$ 195,51 depois da taxa.
    const split = computeSplit({ grossCents: 19700, netCents: 19551, affiliate: { type: "percent", bps: 4000, cents: 0 }, coproducers: [{ id: "c1", bps: 3000 }, { id: "c2", bps: 1500 }] });
    expect(split.affiliateCents).toBe(7880); // 40% do valor da venda
    expect(split.coproducers).toEqual([{ id: "c1", cents: 3501 }, { id: "c2", cents: 1750 }]); // 30% e 15% de 116,71
    expect(split.affiliateCents + split.coproducers[0]!.cents + split.coproducers[1]!.cents + split.producerCents).toBe(19551);
    expect(computeSplit({ grossCents: 19700, netCents: 19551 })).toEqual({ affiliateCents: 0, coproducers: [], producerCents: 19551 });
    // Comissão fixa maior que o líquido fica limitada ao líquido.
    expect(affiliateCommission({ type: "fixed", bps: 0, cents: 50000 }, 19700, 19551)).toBe(19551);
    expect(() => computeSplit({ grossCents: 100, netCents: 90, coproducers: [{ id: "a", bps: 6000 }, { id: "b", bps: 5000 }] })).toThrow();
  });
  it("lançamentos de venda dividida fecham em zero na venda, no reembolso e na contestação", () => {
    const parties = [
      { accountId: "prod", pendingCents: 6000, reserveCents: 300 },
      { accountId: "afil", pendingCents: 7500, reserveCents: 380 },
    ];
    const sale = saleSplitPostings({ buyerTotalCents: 19700, parties });
    expect(sum(sale)).toBe(0);
    expect(sale.find((p) => p.kind === "platform_revenue")!.amountCents).toBe(19700 - 14180);
    const shares = [
      { accountId: "prod", shareCents: 6300, unreleasedPendingCents: 6000, unreleasedReserveCents: 300 },
      { accountId: "afil", shareCents: 7880, unreleasedPendingCents: 0, unreleasedReserveCents: 380 },
    ];
    const refund = refundSplitPostings({ buyerTotalCents: 19700, parties: shares });
    expect(sum(refund)).toBe(0);
    // O afiliado já tinha recebido a parte liberada: ela sai do disponível dele.
    expect(refund.find((p) => p.accountId === "afil" && p.kind === "available")!.amountCents).toBe(-7500);
    expect(sum(chargebackOpenedSplitPostings(shares))).toBe(0);
    const lost = chargebackLostSplitPostings({ buyerTotalCents: 19700, parties: shares });
    expect(sum(lost)).toBe(0);
    expect(lost.filter((p) => p.kind === "disputed").map((p) => p.amountCents)).toEqual([-6300, -7880]);
  });
  it("omite lançamentos zerados", () => {
    expect(salePostings({ accountId: "a", buyerTotalCents: 19700, netCents: 19551, reserveCents: 0 })).toHaveLength(3);
    expect(sum(withdrawalPostings({ accountId: "a", amountCents: 200000 }))).toBe(0);
  });
});

describe("criptografia e webhooks", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("criptografa por campo e detecta adulteração", () => {
    const enc = encryptField("52998224725", key);
    expect(enc).not.toContain("52998224725");
    expect(decryptField(enc, key)).toBe("52998224725");
    expect(encryptField("52998224725", key)).not.toBe(enc);
    expect(() => decryptField(enc.slice(0, -2) + "AA", key)).toThrow();
    expect(blindIndex("52998224725", "k")).toBe(blindIndex("52998224725", "k"));
  });
  it("assina e valida webhooks, recusando corpo alterado e assinatura velha", () => {
    const body = JSON.stringify({ event: "order.paid" });
    const header = signWebhook(body, "segredo");
    expect(verifyWebhook(body, header, "segredo")).toBe(true);
    expect(verifyWebhook(body + " ", header, "segredo")).toBe(false);
    expect(verifyWebhook(body, header, "outro")).toBe(false);
    expect(verifyWebhook(body, header, "segredo", 300, Date.now() + 10 * 60_000)).toBe(false);
  });
  it("provedor simulado aprova e recusa cartões de teste e valida a própria notificação", async () => {
    const p = new SandboxProvider("s");
    const payer = { name: "M", email: "m@e.com", document: "52998224725" };
    const base = { reference: "o1", amountCents: 19700, installments: 1, payer, description: "x" };
    expect((await p.createCardCharge({ ...base, cardToken: "tok_test_approved" })).status).toBe("approved");
    expect(await p.createCardCharge({ ...base, cardToken: "tok_test_insufficient_funds" })).toMatchObject({ status: "refused", reason: "insufficient_funds" });
    const hook = p.buildWebhook({ type: "payment.confirmed", providerRef: "sbx_1" });
    expect(p.parseWebhook(hook.body, hook.headers)).toMatchObject({ type: "payment.confirmed", providerRef: "sbx_1" });
    expect(p.parseWebhook(hook.body, { "sandbox-signature": "t=1,v1=00" })).toBeNull();
  });
});
