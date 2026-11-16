import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChargebackActions, SimulateChargeback } from "@/components/backoffice/risk";
import { Card, Empty, Money, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, paymentLabel } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Risco · Backoffice" };

interface Chargeback {
  id: string;
  status: "open" | "defended" | "won" | "lost";
  reason: string;
  amount_cents: number;
  due_at: string;
  evidence: string | null;
  account_id: string;
  seller_name: string;
  order_number: number;
  method: string;
  paid_at: string;
  product_name: string;
  buyer_name: string;
  buyer_email: string;
}
interface Risk {
  chargebacks: Chargeback[];
  indicators: { chargeback_rate_bps: number; refund_rate_bps: number; open_count: number; open_amount_cents: number; due_soon: number };
  outliers: { id: string; name: string; withdrawals_blocked_reason: string | null; approved: number; refunded: number; chargebacks: number; sold_cents: number }[];
  sandbox: boolean;
  recent_paid: { id: string; number: number; buyer_total_cents: number; product_name: string; seller_name: string }[];
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const ratio = (part: number, total: number) => (total ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const STATUS: Record<Chargeback["status"], { status: string; label: string }> = {
  open: { status: "in_review", label: "Aguardando defesa" },
  defended: { status: "processing", label: "Defesa enviada" },
  won: { status: "approved", label: "Ganha" },
  lost: { status: "failed", label: "Perdida" },
};

function deadline(c: Chargeback) {
  const days = Math.ceil((new Date(c.due_at).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `prazo venceu em ${formatDate(c.due_at)}`, urgent: true };
  if (days <= 2) return { text: days === 0 ? "prazo vence hoje" : `prazo vence em ${days} ${days === 1 ? "dia" : "dias"}`, urgent: true };
  return { text: `prazo até ${formatDate(c.due_at)}`, urgent: false };
}

/** B04 — Risco e chargebacks: fila de contestações com prazo, indicadores e contas fora do padrão. */
export default async function RiskPage() {
  const me = await requireMe("/backoffice/risco");
  if (!me.user.is_backoffice) notFound();
  const r = await api<Risk>("/v1/backoffice/risk");
  const active = r.chargebacks.filter((c) => c.status === "open" || c.status === "defended");
  const closed = r.chargebacks.filter((c) => c.status === "won" || c.status === "lost");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">Risco e contestações</h1>
      <p className="mt-1 text-sm text-muted">Quando o comprador contesta a compra no banco, o valor fica separado até o resultado.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted">Contestações em aberto</p>
          <p className="num mt-1 text-2xl font-bold">{r.indicators.open_count}</p>
          <p className={`mt-1 text-xs ${r.indicators.due_soon ? "text-bad" : "text-muted"}`}>{r.indicators.due_soon ? `${r.indicators.due_soon} com prazo em até 2 dias` : "Nenhuma com prazo apertado"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Valor em contestação</p>
          <Money cents={r.indicators.open_amount_cents} className="mt-1 block text-xl font-bold" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Contestações no mês</p>
          <p className="num mt-1 text-xl font-bold">{pct(r.indicators.chargeback_rate_bps)}</p>
          <p className="mt-1 text-xs text-muted">das vendas aprovadas</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Reembolsos no mês</p>
          <p className="num mt-1 text-xl font-bold">{pct(r.indicators.refund_rate_bps)}</p>
          <p className="mt-1 text-xs text-muted">das vendas aprovadas</p>
        </Card>
      </div>

      <h2 className="mt-7 mb-2 text-lg font-bold">Fila de contestações</h2>
      {active.length === 0 ? (
        <Empty title="Nenhuma contestação em aberto" />
      ) : (
        <div className="space-y-3">
          {active.map((c) => {
            const d = deadline(c);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">
                      Venda #{c.order_number} · {c.product_name}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      <Link href={`/backoffice/contas/${c.account_id}`} className="font-semibold text-accent">
                        {c.seller_name}
                      </Link>{" "}
                      · {paymentLabel(c.method)} · paga em {formatDate(c.paid_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money cents={c.amount_cents} className="block font-bold" />
                    <StatusBadge {...STATUS[c.status]} />
                  </div>
                </div>
                <p className="mt-2 text-sm">
                  <span className="text-muted">Motivo:</span> {c.reason} · <span className="text-muted">Comprador:</span> {c.buyer_name} ({c.buyer_email})
                </p>
                {c.status === "open" && <p className={`mt-1 text-sm font-semibold ${d.urgent ? "text-bad" : "text-wait"}`}>Defesa: {d.text}</p>}
                {c.evidence ? (
                  <div className="mt-2 rounded-lg bg-raised p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted">Provas do produtor</p>
                    <p className="whitespace-pre-wrap">{c.evidence}</p>
                  </div>
                ) : null}
                <ChargebackActions id={c.id} status={c.status} hasEvidence={Boolean(c.evidence)} />
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mt-7 mb-2 text-lg font-bold">Contas fora do padrão</h2>
      <p className="mb-2 text-sm text-muted">Nos últimos 30 dias, com pelo menos 5 vendas: reembolso acima de 10% ou contestação acima de 1%.</p>
      {r.outliers.length === 0 ? (
        <Empty title="Nenhuma conta fora do padrão" />
      ) : (
        <Card className="divide-y divide-line">
          {r.outliers.map((a) => (
            <Link key={a.id} href={`/backoffice/contas/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-raised">
              <span className="min-w-0">
                <span className="block font-semibold">{a.name}</span>
                <span className="block text-xs text-muted">
                  {a.approved} vendas · <Money cents={a.sold_cents} /> vendidos{a.withdrawals_blocked_reason ? " · saques pausados" : ""}
                </span>
              </span>
              <span className="num text-sm">
                Reembolso {ratio(a.refunded, a.approved)} · Contestação {ratio(a.chargebacks, a.approved)}
              </span>
            </Link>
          ))}
        </Card>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mt-7 mb-2 text-lg font-bold">Já resolvidas</h2>
          <Card className="divide-y divide-line">
            {closed.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">Venda #{c.order_number}</span> · {c.seller_name}
                </span>
                <span className="flex items-center gap-2">
                  <Money cents={c.amount_cents} />
                  <StatusBadge {...STATUS[c.status]} />
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      {r.sandbox && (
        <Card className="mt-7 p-4">
          <h2 className="font-bold">Ambiente de testes</h2>
          <p className="mt-0.5 mb-3 text-sm text-muted">Com o provedor de pagamento de verdade, as contestações chegam sozinhas. Aqui dá para criar uma e treinar o fluxo.</p>
          <SimulateChargeback orders={r.recent_paid.map((o) => ({ id: o.id, label: `#${o.number} · ${o.product_name} · ${o.seller_name}` }))} />
        </Card>
      )}
    </main>
  );
}
