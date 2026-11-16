import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm, type CheckoutData } from "@/components/checkout/checkout-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(slug: string): Promise<CheckoutData | null> {
  try {
    return await api<CheckoutData>(`/v1/public/checkout/${slug}`, { token: null });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return { title: "Produto indisponível", robots: { index: false }, alternates: { canonical: null } };
  const description = `${data.product.name}, por ${data.seller.name}. Pague com Pix ou cartão e receba o acesso na hora, com garantia de ${data.product.guarantee_days} dias.`;
  return {
    title: data.product.name,
    description,
    robots: { index: false },
    alternates: { canonical: null },
    openGraph: { type: "website", locale: "pt_BR", siteName: "Domma Mart", title: data.product.name, description },
    twitter: { card: "summary_large_image", title: data.product.name, description },
  };
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <Logo />
        <h1 className="mt-4 text-xl font-extrabold">Este produto não está à venda no momento</h1>
        <p className="text-muted">Confira o link com quem enviou para você. Se já comprou, suas compras continuam disponíveis.</p>
        <Link href="/compras" className="font-bold text-accent underline underline-offset-4">
          Acessar minhas compras
        </Link>
      </main>
    );
  }
  const query = await searchParams;
  const utm = Object.fromEntries(
    Object.entries(query)
      .filter(([k, v]) => (k.startsWith("utm_") || k === "src") && typeof v === "string")
      .map(([k, v]) => [k, String(v).slice(0, 200)]),
  );
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-graphite/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="max-w-[60%] truncate rounded-md border border-dashed border-line px-2.5 py-1 text-sm font-bold">{data.seller.name}</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ok">
              <Lock size={15} aria-hidden /> Pagamento seguro
            </span>
            <ThemeToggle />
          </span>
        </div>
      </header>
      <CheckoutForm data={data} slug={slug} utm={utm} apiUrl={(process.env.PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "")} />
    </div>
  );
}
