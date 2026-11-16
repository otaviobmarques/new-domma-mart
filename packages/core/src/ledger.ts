import type { Cents } from "./money.ts";

/**
 * Livro-razão de dupla entrada. Cada movimento é uma transação com lançamentos
 * que somam zero. Nada é apagado: correção é sempre um novo lançamento.
 *
 * Carteiras do produtor: pending (a liberar), available (disponível), reserved (reservado)
 * e disputed (em contestação).
 * Contas da plataforma: provider_clearing (dinheiro no provedor de pagamento),
 * platform_revenue (receita), payout_transit (saques em andamento).
 */
export type WalletKind = "pending" | "available" | "reserved" | "disputed";
export type PlatformKind = "provider_clearing" | "platform_revenue" | "payout_transit";
export type LedgerKind = WalletKind | PlatformKind;

export interface Posting {
  /** null = conta da plataforma. */
  accountId: string | null;
  kind: LedgerKind;
  /** Positivo credita o saldo da conta; negativo debita. */
  amountCents: Cents;
}

export type LedgerTxKind = "sale" | "release" | "refund" | "withdrawal" | "withdrawal_settled" | "withdrawal_failed" | "adjustment" | "chargeback" | "chargeback_won" | "chargeback_lost";

export function assertBalanced(postings: Posting[]): Posting[] {
  const sum = postings.reduce((acc, p) => acc + p.amountCents, 0);
  if (sum !== 0) throw new Error(`Lançamentos não fecham: diferença de ${sum} centavos`);
  for (const p of postings) {
    if (!Number.isSafeInteger(p.amountCents)) throw new Error("Lançamento com valor inválido");
  }
  return postings.filter((p) => p.amountCents !== 0);
}

export function salePostings(input: {
  accountId: string;
  buyerTotalCents: Cents;
  netCents: Cents;
  reserveCents: Cents;
}): Posting[] {
  const { accountId, buyerTotalCents, netCents, reserveCents } = input;
  return assertBalanced([
    { accountId: null, kind: "provider_clearing", amountCents: -buyerTotalCents },
    { accountId: null, kind: "platform_revenue", amountCents: buyerTotalCents - netCents },
    { accountId, kind: "pending", amountCents: netCents - reserveCents },
    { accountId, kind: "reserved", amountCents: reserveCents },
  ]);
}

export function releasePostings(input: { accountId: string; from: "pending" | "reserved"; amountCents: Cents }): Posting[] {
  return assertBalanced([
    { accountId: input.accountId, kind: input.from, amountCents: -input.amountCents },
    { accountId: input.accountId, kind: "available", amountCents: input.amountCents },
  ]);
}

/**
 * Reembolso total: devolve ao comprador tudo o que ele pagou. A plataforma devolve a
 * sua receita e o produtor devolve o líquido — primeiro do que ainda não foi liberado
 * desta venda; o restante sai do disponível, que pode ficar negativo (item 12.4).
 */
export function refundPostings(input: {
  accountId: string;
  buyerTotalCents: Cents;
  netCents: Cents;
  unreleasedPendingCents: Cents;
  unreleasedReserveCents: Cents;
}): Posting[] {
  const { accountId, buyerTotalCents, netCents, unreleasedPendingCents, unreleasedReserveCents } = input;
  const fromAvailable = netCents - unreleasedPendingCents - unreleasedReserveCents;
  if (fromAvailable < 0) throw new Error("Valores não liberados maiores que o líquido da venda");
  return assertBalanced([
    { accountId: null, kind: "provider_clearing", amountCents: buyerTotalCents },
    { accountId: null, kind: "platform_revenue", amountCents: -(buyerTotalCents - netCents) },
    { accountId, kind: "pending", amountCents: -unreleasedPendingCents },
    { accountId, kind: "reserved", amountCents: -unreleasedReserveCents },
    { accountId, kind: "available", amountCents: -fromAvailable },
  ]);
}

export function withdrawalPostings(input: { accountId: string; amountCents: Cents }): Posting[] {
  return assertBalanced([
    { accountId: input.accountId, kind: "available", amountCents: -input.amountCents },
    { accountId: null, kind: "payout_transit", amountCents: input.amountCents },
  ]);
}

export function withdrawalSettledPostings(input: { amountCents: Cents }): Posting[] {
  return assertBalanced([
    { accountId: null, kind: "payout_transit", amountCents: -input.amountCents },
    { accountId: null, kind: "provider_clearing", amountCents: input.amountCents },
  ]);
}

export function withdrawalFailedPostings(input: { accountId: string; amountCents: Cents }): Posting[] {
  return assertBalanced([
    { accountId: null, kind: "payout_transit", amountCents: -input.amountCents },
    { accountId: input.accountId, kind: "available", amountCents: input.amountCents },
  ]);
}

/**
 * Contestação aberta (chargeback): o líquido da venda sai de onde estiver — do que ainda não
 * foi liberado e, se preciso, do disponível — e fica separado em "em contestação" até o resultado.
 */
export function chargebackOpenedPostings(input: { accountId: string; netCents: Cents; unreleasedPendingCents: Cents; unreleasedReserveCents: Cents }): Posting[] {
  const { accountId, netCents, unreleasedPendingCents, unreleasedReserveCents } = input;
  const fromAvailable = netCents - unreleasedPendingCents - unreleasedReserveCents;
  if (fromAvailable < 0) throw new Error("Valores não liberados maiores que o líquido da venda");
  return assertBalanced([
    { accountId, kind: "pending", amountCents: -unreleasedPendingCents },
    { accountId, kind: "reserved", amountCents: -unreleasedReserveCents },
    { accountId, kind: "available", amountCents: -fromAvailable },
    { accountId, kind: "disputed", amountCents: netCents },
  ]);
}

/** Contestação ganha: o valor volta para o disponível do produtor. */
export function chargebackWonPostings(input: { accountId: string; netCents: Cents }): Posting[] {
  return assertBalanced([
    { accountId: input.accountId, kind: "disputed", amountCents: -input.netCents },
    { accountId: input.accountId, kind: "available", amountCents: input.netCents },
  ]);
}

/** Contestação perdida: o comprador recebe tudo de volta; a plataforma devolve a própria receita. */
export function chargebackLostPostings(input: { accountId: string; buyerTotalCents: Cents; netCents: Cents }): Posting[] {
  return assertBalanced([
    { accountId: input.accountId, kind: "disputed", amountCents: -input.netCents },
    { accountId: null, kind: "platform_revenue", amountCents: -(input.buyerTotalCents - input.netCents) },
    { accountId: null, kind: "provider_clearing", amountCents: input.buyerTotalCents },
  ]);
}
