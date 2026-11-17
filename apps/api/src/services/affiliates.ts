import { type Commission, computeSplit } from "@domma/core";
import type { Tx } from "@domma/db";

export const commissionOf = (program: Record<string, any>, affiliation?: Record<string, any> | null): Commission =>
  affiliation?.commission_type
    ? { type: affiliation.commission_type, bps: affiliation.commission_bps ?? 0, cents: affiliation.commission_cents ?? 0 }
    : { type: program.affiliate_commission_type, bps: program.affiliate_commission_bps, cents: program.affiliate_commission_cents };

/**
 * Decide quem divide uma venda, no momento do pedido. Devolve as fatias de afiliado e coprodutores
 * prontas para gravar; o que sobra é do produtor. Comprar pelo próprio link não gera comissão.
 */
export async function planOrderSplit(tx: Tx, input: { productId: string; producerAccountId: string; grossCents: number; netCents: number; ref?: string | null; buyerUserId: string; now: Date }) {
  const [product] = await tx`
    select affiliate_mode, affiliate_commission_type, affiliate_commission_bps, affiliate_commission_cents from products where id = ${input.productId}`;
  let affiliation: Record<string, any> | null = null;
  if (input.ref && product && product.affiliate_mode !== "closed") {
    const [row] = await tx`
      select f.*, a.owner_user_id from affiliations f join accounts a on a.id = f.affiliate_account_id
      where f.code = ${input.ref} and f.product_id = ${input.productId} and f.status = 'approved' and a.status = 'active'`;
    if (row && row.owner_user_id !== input.buyerUserId) affiliation = row;
  }
  const coproducers = await tx`
    select id, coproducer_account_id, percent_bps from coproductions
    where product_id = ${input.productId} and status = 'accepted' and (ends_at is null or ends_at > ${input.now}) order by created_at`;
  const split = computeSplit({
    grossCents: input.grossCents,
    netCents: input.netCents,
    affiliate: affiliation ? commissionOf(product!, affiliation) : null,
    coproducers: coproducers.map((c) => ({ id: c.id as string, bps: c.percent_bps as number })),
  });
  const rows = [
    ...(affiliation && split.affiliateCents > 0 ? [{ accountId: affiliation.affiliate_account_id as string, role: "affiliate", amountCents: split.affiliateCents, affiliationId: affiliation.id as string, coproductionId: null }] : []),
    ...split.coproducers
      .filter((c) => c.cents > 0)
      .map((c) => ({ accountId: coproducers.find((x) => x.id === c.id)!.coproducer_account_id as string, role: "coproducer", amountCents: c.cents, affiliationId: null, coproductionId: c.id })),
  ];
  return { affiliationId: (affiliation?.id as string | undefined) ?? null, commissionsCents: rows.reduce((a, r) => a + r.amountCents, 0), rows };
}
