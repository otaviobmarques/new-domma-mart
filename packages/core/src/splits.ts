import type { Bps, Cents } from "./money.ts";

export interface Commission {
  type: "percent" | "fixed";
  bps: Bps;
  cents: Cents;
}

/** Comissão do afiliado em uma venda: percentual sobre o valor da venda ou valor fixo, nunca maior que o líquido. */
export function affiliateCommission(commission: Commission, grossCents: Cents, netCents: Cents): Cents {
  const raw = commission.type === "percent" ? Math.floor((grossCents * commission.bps) / 10_000) : commission.cents;
  return Math.max(0, Math.min(raw, netCents));
}

export interface SplitResult {
  affiliateCents: Cents;
  coproducers: { id: string; cents: Cents }[];
  /** O que sobra para o produtor. */
  producerCents: Cents;
}

/**
 * Divide o líquido de uma venda (já sem a taxa da plataforma). Primeiro sai a comissão do afiliado;
 * do que sobra, cada coprodutor leva o seu percentual; o resto é do produtor. Os centavos que
 * sobram do arredondamento ficam com o produtor, então a soma fecha sempre no líquido.
 */
export function computeSplit(input: { grossCents: Cents; netCents: Cents; affiliate?: Commission | null; coproducers?: { id: string; bps: Bps }[] }): SplitResult {
  const affiliateCents = input.affiliate ? affiliateCommission(input.affiliate, input.grossCents, input.netCents) : 0;
  const rest = input.netCents - affiliateCents;
  const list = input.coproducers ?? [];
  if (list.reduce((a, c) => a + c.bps, 0) > 10_000) throw new Error("A soma dos coprodutores passa de 100%");
  const coproducers = list.map((c) => ({ id: c.id, cents: Math.floor((rest * c.bps) / 10_000) }));
  return { affiliateCents, coproducers, producerCents: rest - coproducers.reduce((a, c) => a + c.cents, 0) };
}
