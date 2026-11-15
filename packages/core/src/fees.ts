import { type Bps, type Cents, assertCents, percentOf } from "./money.ts";

export type PaymentMethod = "pix" | "card" | "boleto";
export type InterestPayer = "buyer" | "producer";

export interface MethodFee {
  percentBps: Bps;
  fixedCents: Cents;
}

/** Tabela de taxas (capítulo 12.2). A padrão vem das configurações da plataforma; cada conta pode ter a sua. */
export interface FeeTable {
  pix: MethodFee;
  card: MethodFee;
  boleto: MethodFee;
  /** Juros de parcelamento ao mês, em pontos-base. */
  installmentInterestBpsMonthly: Bps;
  maxInstallments: number;
}

/** Proposta inicial do descritivo (item 12.2) — a validar com o provedor de pagamento. */
export const DEFAULT_FEE_TABLE: FeeTable = {
  pix: { percentBps: 0, fixedCents: 149 },
  card: { percentBps: 399, fixedCents: 149 },
  boleto: { percentBps: 399, fixedCents: 149 },
  installmentInterestBpsMonthly: 299,
  maxInstallments: 12,
};

export function resolveFeeTable(base: FeeTable, override?: Partial<FeeTable> | null): FeeTable {
  if (!override) return base;
  return {
    pix: { ...base.pix, ...override.pix },
    card: { ...base.card, ...override.card },
    boleto: { ...base.boleto, ...override.boleto },
    installmentInterestBpsMonthly: override.installmentInterestBpsMonthly ?? base.installmentInterestBpsMonthly,
    maxInstallments: override.maxInstallments ?? base.maxInstallments,
  };
}

/**
 * Valor de cada parcela pela tabela Price. A parcela é arredondada para cima
 * (o comprador nunca paga menos que o financiamento custa).
 */
export function installmentAmount(principal: Cents, installments: number, monthlyBps: Bps): Cents {
  assertCents(principal);
  if (installments <= 1 || monthlyBps === 0) return Math.ceil(principal / Math.max(installments, 1));
  const i = monthlyBps / 10000;
  const factor = i / (1 - (1 + i) ** -installments);
  return Math.ceil(principal * factor - 1e-9);
}

export interface InstallmentOption {
  installments: number;
  installmentCents: Cents;
  totalCents: Cents;
  interestCents: Cents;
}

export function installmentOptions(
  principal: Cents,
  table: FeeTable,
  opts: { max?: number; interestPayer?: InterestPayer; minInstallmentCents?: Cents } = {},
): InstallmentOption[] {
  const max = Math.min(opts.max ?? table.maxInstallments, table.maxInstallments);
  const min = opts.minInstallmentCents ?? 500;
  const out: InstallmentOption[] = [];
  for (let n = 1; n <= max; n++) {
    const rate = opts.interestPayer === "producer" ? 0 : table.installmentInterestBpsMonthly;
    const installmentCents = installmentAmount(principal, n, rate);
    if (n > 1 && installmentCents < min) break;
    const totalCents = n === 1 ? principal : installmentCents * n;
    out.push({ installments: n, installmentCents, totalCents, interestCents: totalCents - principal });
  }
  return out;
}

export interface SaleInput {
  method: PaymentMethod;
  /** Valor dos itens já com desconto de cupom. */
  priceCents: Cents;
  installments?: number;
  interestPayer?: InterestPayer;
}

/** Fotografia das condições no momento da venda — gravada no pedido para o extrato nunca mudar depois (12.3). */
export interface FeeSnapshot {
  method: PaymentMethod;
  percentBps: Bps;
  fixedCents: Cents;
  installments: number;
  interestBpsMonthly: Bps;
  interestPayer: InterestPayer;
}

export interface SaleBreakdown {
  /** Valor da venda para o produtor (preço com desconto). */
  grossCents: Cents;
  /** O que o comprador paga de fato (preço + juros, quando ele paga os juros). */
  buyerTotalCents: Cents;
  /** Custo do parcelamento. */
  interestCents: Cents;
  /** Taxa da plataforma sobre a venda (percentual + fixo). */
  feeCents: Cents;
  /** O que entra na carteira do produtor. */
  netCents: Cents;
  /** Receita da plataforma nesta venda (taxa + juros). */
  platformRevenueCents: Cents;
  snapshot: FeeSnapshot;
}

export function computeSale(input: SaleInput, table: FeeTable): SaleBreakdown {
  const price = assertCents(input.priceCents, "preço");
  if (price <= 0) throw new Error("O preço precisa ser maior que zero");
  const installments = input.method === "card" ? Math.max(1, input.installments ?? 1) : 1;
  if (installments > table.maxInstallments) throw new Error("Número de parcelas acima do permitido");
  const interestPayer = input.interestPayer ?? "buyer";
  const methodFee = table[input.method];

  const financedTotal =
    installments > 1
      ? installmentAmount(price, installments, table.installmentInterestBpsMonthly) * installments
      : price;
  const interestCents = financedTotal - price;
  const feeCents = Math.min(price, percentOf(price, methodFee.percentBps) + methodFee.fixedCents);

  const buyerTotalCents = interestPayer === "buyer" ? price + interestCents : price;
  const producerCost = feeCents + (interestPayer === "producer" ? interestCents : 0);
  const netCents = Math.max(0, price - producerCost);

  return {
    grossCents: price,
    buyerTotalCents,
    interestCents,
    feeCents,
    netCents,
    platformRevenueCents: buyerTotalCents - netCents,
    snapshot: {
      method: input.method,
      percentBps: methodFee.percentBps,
      fixedCents: methodFee.fixedCents,
      installments,
      interestBpsMonthly: installments > 1 ? table.installmentInterestBpsMonthly : 0,
      interestPayer,
    },
  };
}
