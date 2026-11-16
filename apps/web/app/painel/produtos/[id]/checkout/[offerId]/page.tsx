import { resolveCheckoutConfig } from "@domma/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutEditor } from "@/components/painel/checkout-editor";
import { ApiError, api } from "@/lib/api";

export const metadata: Metadata = { title: "Editor de checkout" };

interface Product {
  id: string;
  name: string;
  status: string;
  offers: { id: string; name: string; checkout_config: unknown; checkout_draft: unknown }[];
}

export default async function CheckoutEditorPage({ params }: { params: Promise<{ id: string; offerId: string }> }) {
  const { id, offerId } = await params;
  let product: Product;
  try {
    product = await api<Product>(`/v1/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const offer = product.offers.find((o) => o.id === offerId);
  if (!offer) notFound();
  return (
    <CheckoutEditor
      productId={product.id}
      productName={product.name}
      offerId={offer.id}
      offerName={offer.name}
      initial={resolveCheckoutConfig(offer.checkout_draft ?? offer.checkout_config)}
      hasDraft={Boolean(offer.checkout_draft)}
      published={product.status === "approved"}
    />
  );
}
