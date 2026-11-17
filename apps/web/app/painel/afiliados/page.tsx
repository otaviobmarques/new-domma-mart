import { formatBRL } from "@domma/core";
import type { AffiliateProgram } from "@/app/painel/actions";
import { AffiliateActions, AffiliateTabs, CoproducerForm, EndCoproduction, ProgramForm } from "@/components/painel/affiliates";
import { Card, Empty, Money, PageTitle, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Affiliate {
  id: string;
  status: string;
  commission_type: "percent" | "fixed" | null;
  commission_bps: number | null;
  commission_cents: number | null;
  clicks: number;
  sales: number;
  commission_cents_total: number;
  affiliate_name: string;
  affiliate_email: string;
}
interface Coproducer {
  id: string;
  percent_bps: number;
  status: string;
  ends_at: string | null;
  coproducer_name: string;
  coproducer_email: string;
  paid_cents_total: number;
}
interface Data {
  products: { id: string; name: string; status: string; program: AffiliateProgram; affiliates: Affiliate[]; coproducers: Coproducer[] }[];
  pending: number;
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const STATUS: Record<string, { status: string; label: string }> = {
  pending: { status: "in_review", label: "Aguardando você" },
  approved: { status: "approved", label: "Divulgando" },
  blocked: { status: "blocked", label: "Bloqueado" },
  rejected: { status: "failed", label: "Recusado" },
};
const CO_STATUS: Record<string, { status: string; label: string }> = {
  invited: { status: "pending", label: "Aguardando aceite" },
  accepted: { status: "approved", label: "Ativa" },
  ended: { status: "paused", label: "Encerrada" },
};

/** P10 — Afiliados: quem vende os seus produtos e com quem você divide a receita. */
export default async function AffiliatesPage() {
  const [data, products] = await Promise.all([api<Data>("/v1/affiliates"), api<{ data: { id: string; price_cents?: number; default_offer_price_cents?: number }[] }>("/v1/products")]);
  const priceOf = (id: string) => {
    const p = products.data.find((x) => x.id === id);
    return p?.default_offer_price_cents ?? p?.price_cents ?? null;
  };

  return (
    <>
      <PageTitle title="Afiliados" subtitle="Deixe outras pessoas venderem por você e divida a receita com parceiros. O dinheiro é separado sozinho a cada venda." />
      <AffiliateTabs />
      {data.products.length === 0 ? (
        <Empty title="Crie um produto primeiro">O programa de afiliados é ligado em cada produto.</Empty>
      ) : (
        <div className="space-y-4">
          {data.products.map((p) => {
            const pending = p.affiliates.filter((a) => a.status === "pending");
            const others = p.affiliates.filter((a) => a.status !== "pending");
            return (
              <Card key={p.id} className="min-w-0 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="min-w-0 text-lg font-bold break-words">{p.name}</h2>
                  {p.status !== "approved" && <StatusBadge status={p.status} />}
                </div>
                <ProgramForm productId={p.id} priceCents={priceOf(p.id)} initial={p.program} />

                {pending.length > 0 && (
                  <section className="mt-6">
                    <h3 className="mb-2 font-bold">Pedidos para divulgar ({pending.length})</h3>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {pending.map((a) => (
                        <li key={a.id} className="p-3 text-sm">
                          <p className="font-semibold">{a.affiliate_name}</p>
                          <p className="text-xs break-all text-muted">{a.affiliate_email}</p>
                          <AffiliateActions id={a.id} status={a.status} ownCommission={null} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {others.length > 0 && (
                  <section className="mt-6">
                    <h3 className="mb-2 font-bold">Afiliados ({others.length})</h3>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {others.map((a) => {
                        const own = a.commission_type === "percent" ? pct(a.commission_bps ?? 0) : a.commission_type === "fixed" ? formatBRL(a.commission_cents ?? 0) : null;
                        return (
                          <li key={a.id} className="p-3 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">{a.affiliate_name}</p>
                                <p className="text-xs break-all text-muted">{a.affiliate_email}</p>
                              </div>
                              <StatusBadge {...(STATUS[a.status] ?? { status: a.status })} />
                            </div>
                            <p className="mt-1.5 text-xs text-muted">
                              <span className="num">{a.clicks}</span> {a.clicks === 1 ? "clique" : "cliques"} · <span className="num">{a.sales}</span> {a.sales === 1 ? "venda" : "vendas"} · comissão paga: <Money cents={a.commission_cents_total} />
                            </p>
                            <AffiliateActions id={a.id} status={a.status} ownCommission={own} />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <section className="mt-6">
                  <h3 className="font-bold">Coprodução</h3>
                  <p className="mt-0.5 mb-3 text-sm text-muted">Divida cada venda com um parceiro, como um sócio do produto. A parte dele é calculada depois da taxa e da comissão de afiliado.</p>
                  {p.coproducers.length > 0 && (
                    <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
                      {p.coproducers.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {c.coproducer_name} · <span className="num">{pct(c.percent_bps)}</span>
                            </p>
                            <p className="text-xs text-muted">
                              {c.ends_at ? `até ${formatDate(c.ends_at)}` : "sem data para acabar"} · já recebeu <Money cents={c.paid_cents_total} />
                            </p>
                          </div>
                          <span className="flex items-center gap-3">
                            <StatusBadge {...(CO_STATUS[c.status] ?? { status: c.status })} />
                            {c.status !== "ended" && <EndCoproduction id={c.id} invited={c.status === "invited"} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <CoproducerForm productId={p.id} />
                </section>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
