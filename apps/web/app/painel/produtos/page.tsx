import { Plus } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/painel/copy-button";
import { ButtonLink, Card, Cover, Empty, PageTitle, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { PRODUCT_TYPE_LABEL } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  type: string;
  status: string;
  cover_url: string | null;
  sales_month: number;
  checkout_url: string | null;
  review_reason: string | null;
}

/** P05 — Produtos (lista). */
export default async function ProductsPage() {
  const { data } = await api<{ data: Product[] }>("/v1/products");
  return (
    <>
      <PageTitle
        title="Produtos"
        action={
          <ButtonLink href="/painel/produtos/novo">
            <Plus size={16} aria-hidden /> Novo
          </ButtonLink>
        }
      />
      {data.length === 0 ? (
        <Empty title="Você ainda não tem produtos">
          Descreva o que quer vender e a Domma IA deixa tudo pronto para você revisar.
          <ButtonLink href="/painel/produtos/novo" className="mt-4">
            Criar produto com IA
          </ButtonLink>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((p) => (
            <Card key={p.id} className="p-4">
              <Link href={`/painel/produtos/${p.id}`} className="flex gap-3.5">
                <Cover src={p.cover_url} />
                <span className="min-w-0">
                  <span className="block leading-snug font-bold">{p.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {PRODUCT_TYPE_LABEL[p.type] ?? p.type} ·{" "}
                    {p.status === "draft" ? "não publicado" : p.sales_month === 0 ? "ainda sem vendas no mês" : `${p.sales_month} ${p.sales_month === 1 ? "venda" : "vendas"} no mês`}
                  </span>
                </span>
              </Link>
              <div className="mt-3 flex items-center gap-2.5">
                <StatusBadge status={p.status} />
                <div className="flex-1">
                  {p.status === "approved" && p.checkout_url ? (
                    <CopyButton text={p.checkout_url} full />
                  ) : (
                    <ButtonLink href={`/painel/produtos/${p.id}`} variant="outline" full>
                      {p.status === "draft" ? "Continuar edição" : "Ver produto"}
                    </ButtonLink>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
