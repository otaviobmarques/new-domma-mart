import { ApiError, api } from "@/lib/api";
import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Pagamento seguro pelo Domma Mart";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Prévia do link do checkout: o produto, o preço e a garantia — é o link que o produtor mais compartilha. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data: { offer: { price_cents: number }; product: { name: string; guarantee_days: number }; seller: { name: string } } | null = null;
  try {
    data = await api(`/v1/public/checkout/${slug}`, { token: null });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }
  if (!data) return ogImage({ eyebrow: "Pagamento seguro", title: "Checkout", highlight: "Domma Mart", footer: [{ value: "Pix e cartão", label: "aprovação na hora" }] });
  const name = data.product.name.length > 70 ? `${data.product.name.slice(0, 68)}…` : data.product.name;
  return ogImage({
    eyebrow: `${data.seller.name} · pagamento seguro`,
    title: name,
    footer: [
      { value: (data.offer.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), label: "Pix ou cartão" },
      { value: `${data.product.guarantee_days} dias`, label: "de garantia" },
      { value: "Na hora", label: "acesso liberado" },
    ],
  });
}
