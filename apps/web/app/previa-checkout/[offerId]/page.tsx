import { DEFAULT_FEE_TABLE, type InterestPayer, installmentOptions, resolveCheckoutConfig } from "@domma/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CheckoutData } from "@/components/checkout/checkout-form";
import { PreviewHost } from "@/components/checkout/preview-host";
import { ApiError, api } from "@/lib/api";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Pré-visualização do checkout", robots: { index: false }, alternates: { canonical: null } };

interface Product {
  id: string;
  name: string;
  description: string;
  type: string;
  guarantee_days: number;
  cover_url: string | null;
  support_contact: string | null;
  offers: { id: string; slug: string; name: string; price_cents: number; methods: ("pix" | "card")[]; max_installments: number; interest_payer: InterestPayer; checkout_config: unknown; checkout_draft: unknown }[];
  bumps: { id: string; offer_id: string; title: string; description: string; price_cents: number }[];
}

/** Página carregada dentro do editor (P06). Só o próprio produtor abre; nada aqui cria pedido. */
export default async function CheckoutPreviewPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams: Promise<{ produto?: string }> }) {
  const { offerId } = await params;
  const { produto } = await searchParams;
  const me = await requireMe("/painel/produtos");
  if (!produto) notFound();
  let product: Product;
  try {
    product = await api<Product>(`/v1/products/${produto}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const offer = product.offers.find((o) => o.id === offerId);
  if (!offer) notFound();
  const account = me.accounts.find((a) => a.id === me.current_account_id);
  const data: CheckoutData = {
    offer: { id: offer.id, slug: offer.slug, name: offer.name, price_cents: offer.price_cents, methods: offer.methods, config: resolveCheckoutConfig(offer.checkout_config) },
    product: { id: product.id, name: product.name, description: product.description, cover_url: product.cover_url, guarantee_days: product.guarantee_days, type: product.type },
    seller: { name: account?.name ?? me.user.name, support_contact: product.support_contact, verified: account?.kyc_status === "approved" },
    bumps: product.bumps.filter((b) => b.offer_id === offer.id).map((b) => ({ id: b.id, title: b.title, description: b.description, price_cents: b.price_cents })),
    installments: installmentOptions(offer.price_cents, DEFAULT_FEE_TABLE, { max: offer.max_installments, interestPayer: offer.interest_payer }).map((o) => ({ installments: o.installments, installment_cents: o.installmentCents, total_cents: o.totalCents })),
    pix_expires_minutes: 15,
    sandbox: false,
  };
  return <PreviewHost data={data} initial={resolveCheckoutConfig(offer.checkout_draft ?? offer.checkout_config)} />;
}
