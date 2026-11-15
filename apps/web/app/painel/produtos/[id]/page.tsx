import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/painel/copy-button";
import { AddLesson, AddModule, EditGeneral, NewOffer, StatusActions } from "@/components/painel/product-controls";
import { Card, Cover, Money, Notice, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { PRODUCT_TYPE_LABEL } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  guarantee_days: number;
  cover_url: string | null;
  support_contact: string | null;
  review_reason: string | null;
  offers: { id: string; name: string; price_cents: number; max_installments: number; interest_payer: string; is_default: boolean; checkout_url: string }[];
  modules: { id: string; title: string; lessons: { id: string; title: string; video_url: string | null; release_after_days: number }[] }[];
}

/** P05 — Produto (detalhe): geral, ofertas e conteúdo. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let p: Product;
  try {
    p = await api<Product>(`/v1/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const lessons = p.modules.reduce((a, m) => a + m.lessons.length, 0);
  return (
    <>
      <Link href="/painel/produtos" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ChevronLeft size={16} aria-hidden /> Produtos
      </Link>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <Cover src={p.cover_url} />
          <div>
            <h1 className="text-xl leading-tight font-extrabold">{p.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={p.status} />
              {PRODUCT_TYPE_LABEL[p.type]} · {lessons} {lessons === 1 ? "aula" : "aulas"} · garantia de {p.guarantee_days} dias
            </p>
          </div>
        </div>
        <StatusActions id={p.id} status={p.status} />
      </div>

      {p.status === "in_review" && <Notice tone="wait">Em análise pela nossa equipe{p.review_reason ? `: ${p.review_reason.toLowerCase()}` : ""}. A resposta chega por e-mail em até 5 dias úteis. Enquanto isso, o checkout fica fora do ar.</Notice>}
      {p.status === "blocked" && <Notice tone="bad">Este produto não foi aprovado{p.review_reason ? `. Motivo: ${p.review_reason}` : ""}. Você pode contestar respondendo o e-mail da análise; a resposta sai em até 5 dias úteis.</Notice>}
      {p.status === "draft" && p.review_reason && <Notice tone="wait">A equipe pediu um ajuste antes de publicar: {p.review_reason}</Notice>}

      <section className="mt-5">
        <h2 className="mb-3 font-bold">Ofertas</h2>
        <div className="space-y-2.5">
          {p.offers.map((o) => (
            <Card key={o.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">{o.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  <Money cents={o.price_cents} className="font-bold text-paper" /> · {o.max_installments === 1 ? "só à vista" : `até ${o.max_installments}x`} · {o.interest_payer === "buyer" ? "comprador paga os juros" : "sem juros para o comprador"}
                </p>
              </div>
              {p.status === "approved" ? <CopyButton text={o.checkout_url} /> : <span className="text-sm text-muted">Link disponível depois da aprovação</span>}
            </Card>
          ))}
        </div>
        <div className="mt-3">
          <NewOffer productId={p.id} />
        </div>
        <p className="mt-2 text-xs text-muted">Mudar o preço vale só para as próximas vendas.</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-bold">Conteúdo</h2>
        <div className="space-y-2.5">
          {p.modules.map((m, i) => (
            <Card key={m.id} className="p-3">
              <h3 className="px-2 py-1 text-sm font-bold">
                {i + 1}. {m.title} <span className="font-normal text-muted">· {m.lessons.length} {m.lessons.length === 1 ? "aula" : "aulas"}</span>
              </h3>
              <ul>
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm">
                    <span>{l.title}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {l.video_url ? "com vídeo" : "sem vídeo"}
                      {l.release_after_days > 0 ? ` · libera em ${l.release_after_days} dias` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <AddLesson moduleId={m.id} productId={p.id} />
            </Card>
          ))}
          <AddModule productId={p.id} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-bold">Geral</h2>
        <Card className="p-4">
          <EditGeneral id={p.id} name={p.name} description={p.description} supportContact={p.support_contact} />
        </Card>
      </section>
    </>
  );
}
