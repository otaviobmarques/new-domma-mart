import { formatBRL } from "@domma/core";
import { AffiliateTabs, CoproductionInvite, EndCoproduction, JoinButton } from "@/components/painel/affiliates";
import { CopyButton } from "@/components/painel/copy-button";
import { ButtonLink, Card, Cover, Empty, Money, PageTitle, StatusBadge, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Portal {
  month_commission_cents: number;
  mine: { id: string; status: string; name: string; cover_url: string | null; seller_name: string; price_cents: number; link: string | null; paused: boolean; clicks: number; sales: number; commission_cents_total: number; earn_cents: number; materials: { title: string; url: string }[] }[];
  discover: { product_id: string; name: string; description: string; cover_url: string | null; seller_name: string; price_cents: number; mode: string; earn_cents: number }[];
  coproductions: { id: string; percent_bps: number; status: string; ends_at: string | null; product_name: string; seller_name: string; paid_cents_total: number }[];
  recent: { amount_cents: number; role: string; number: number; status: string; paid_at: string; product_name: string }[];
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** A01 — Portal do afiliado, em uma tela só: encontrar um produto, tocar em Divulgar e pegar o link. */
export default async function AffiliatePortalPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const portal = await api<Portal>(`/v1/affiliate/portal${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const invites = portal.coproductions.filter((c) => c.status === "invited");
  const active = portal.coproductions.filter((c) => c.status === "accepted");

  return (
    <>
      <PageTitle title="Afiliados" subtitle="Divulgue produtos de outras pessoas e ganhe comissão a cada venda." />
      <AffiliateTabs />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm text-muted">Suas comissões neste mês</p>
          <Money cents={portal.month_commission_cents} className="mt-1 block text-3xl font-extrabold text-accent" />
        </div>
        <ButtonLink href="/painel/financeiro">Sacar</ButtonLink>
      </Card>

      {invites.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Convites de coprodução</h2>
          <div className="space-y-2">
            {invites.map((c) => (
              <Card key={c.id} className="border-brand/40 p-4 text-sm">
                <p className="font-bold">{c.product_name}</p>
                <p className="mt-0.5 text-muted">
                  {c.seller_name} convidou você para receber <span className="num font-semibold text-paper">{pct(c.percent_bps)}</span> de cada venda, depois da taxa e da comissão de afiliado
                  {c.ends_at ? `, até ${formatDate(c.ends_at)}` : ""}.
                </p>
                <CoproductionInvite id={c.id} />
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">Você já divulga</h2>
        {portal.mine.length === 0 ? (
          <Empty title="Você ainda não divulga nenhum produto">Escolha um produto abaixo e toque em Divulgar: o link sai na hora.</Empty>
        ) : (
          <div className="space-y-2">
            {portal.mine.map((m) => (
              <Card key={m.id} className="min-w-0 p-4">
                <div className="flex items-start gap-3">
                  <Cover src={m.cover_url} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold break-words">{m.name}</p>
                    <p className="text-xs text-muted">
                      {m.seller_name} · você ganha <span className="font-semibold text-paper">{formatBRL(m.earn_cents)}</span> por venda
                    </p>
                  </div>
                  {m.status === "pending" ? <StatusBadge status="in_review" label="Pedido enviado" /> : m.status === "blocked" ? <StatusBadge status="blocked" /> : m.paused ? <StatusBadge status="paused" label="Programa pausado" /> : null}
                </div>
                {m.link ? (
                  <>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input readOnly value={m.link} aria-label="Seu link" className={`${inputClass} num h-11 min-w-0 text-sm`} />
                      <span className="shrink-0">
                        <CopyButton text={m.link} label="Copiar" variant="primary" />
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      <span className="num">{m.clicks}</span> {m.clicks === 1 ? "clique" : "cliques"} · <span className="num">{m.sales}</span> {m.sales === 1 ? "venda" : "vendas"} · comissão: <Money cents={m.commission_cents_total} />
                    </p>
                    {m.materials.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        <span className="text-muted">Materiais:</span>
                        {m.materials.map((mat) => (
                          <a key={mat.url} href={mat.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-4">
                            {mat.title}
                          </a>
                        ))}
                      </p>
                    )}
                  </>
                ) : (
                  m.status === "pending" && <p className="mt-2 text-sm text-muted">O produtor precisa aprovar. Avisamos por e-mail quando o link for liberado.</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">Encontre produtos para divulgar</h2>
        <form className="mb-3 flex gap-2" action="/painel/afiliados/divulgar">
          <input name="q" defaultValue={q} placeholder="Buscar por produto ou produtor" aria-label="Buscar produtos" className={`${inputClass} h-11`} />
          <button className="h-11 shrink-0 rounded-lg border border-line px-4 text-sm font-semibold hover:bg-raised">Buscar</button>
        </form>
        {portal.discover.length === 0 ? (
          <Empty title={q ? "Nenhum produto encontrado" : "Nenhum produto com programa aberto no momento"} />
        ) : (
          <div className="space-y-2">
            {portal.discover.map((d) => (
              <Card key={d.product_id} className="flex min-w-0 items-center gap-3 p-4">
                <Cover src={d.cover_url} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold break-words">{d.name}</p>
                  <p className="text-xs text-muted">
                    {d.seller_name} · <Money cents={d.price_cents} />
                    {d.mode === "approval" ? " · precisa de aprovação" : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    Você ganha <span className="font-bold text-accent">{formatBRL(d.earn_cents)}</span> por venda
                  </p>
                </div>
                <JoinButton productId={d.product_id} mode={d.mode} />
              </Card>
            ))}
          </div>
        )}
      </section>

      {active.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Suas coproduções</h2>
          <Card className="divide-y divide-line">
            {active.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{c.product_name}</span>
                  <span className="block text-xs text-muted">
                    {c.seller_name} · {pct(c.percent_bps)} de cada venda · já recebeu <Money cents={c.paid_cents_total} />
                  </span>
                </span>
                <EndCoproduction id={c.id} invited={false} />
              </div>
            ))}
          </Card>
        </section>
      )}

      {portal.recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Últimas comissões</h2>
          <Card className="divide-y divide-line">
            {portal.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.product_name}</span>
                  <span className="block text-xs text-muted">
                    {r.role === "affiliate" ? "Afiliado" : "Coprodução"} · venda #{r.number} · {formatDate(r.paid_at)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.status !== "paid" && <StatusBadge status={r.status} />}
                  <Money cents={r.amount_cents} className={r.status === "paid" ? "font-bold" : "text-muted line-through"} />
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
