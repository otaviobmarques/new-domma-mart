import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KycDecision, ProductDecision, TicketAnswer } from "@/components/backoffice/decision";
import { Bars } from "@/components/painel/bars";
import { Card, Empty, Money, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { PRODUCT_TYPE_LABEL, formatDateTime, timeAgo } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Backoffice", robots: { index: false }, alternates: { canonical: null } };

interface Overview {
  today: { volume_cents: number; orders: number; revenue_cents: number };
  card_approval_bps: number | null;
  refund_rate_bps: number;
  chargeback_rate_bps: number;
  queue: { products: number; accounts: number; link_reports: number; product_reports: number };
  chart: { day: string; total_cents: number }[];
}
interface Queue {
  products: { id: string; name: string; description: string; type: string; review_triage: string | null; review_reason: string | null; updated_at: string; seller_name: string; kyc_status: string; approved_before: number; price_cents: number | null }[];
  accounts: { id: string; name: string; email: string; created_at: string; documents_sent_at: string | null }[];
  link_reports: { id: string; url: string; created_at: string }[];
  tickets: { id: string; number: number; topic: string; message: string; source: string; due_at: string; created_at: string; user_name: string; email: string; product_name: string | null }[];
}

const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const TRIAGE: Record<string, { label: string; status: string }> = {
  approve: { label: "IA: aprovar", status: "approved" },
  reject: { label: "IA: recusar", status: "refused" },
  doubt: { label: "IA: dúvida", status: "in_review" },
};

/** B01 + B02 — Painel da plataforma e fila de aprovação (backoffice básico da fase 1). */
export default async function BackofficePage() {
  const me = await requireMe("/backoffice");
  if (!me.user.is_backoffice) notFound();
  const [o, q] = await Promise.all([api<Overview>("/v1/backoffice/overview"), api<Queue>("/v1/backoffice/queue")]);

  return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-extrabold">Painel da plataforma</h1>
        <p className="mt-1 text-sm text-muted">Como está a operação hoje. Acesso da equipe Domma, registrado.</p>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted">Volume processado hoje</p>
            <Money cents={o.today.volume_cents} className="mt-1 block text-2xl font-bold text-accent" />
            <p className="mt-1 text-xs text-muted">{o.today.orders} vendas aprovadas</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Receita da plataforma hoje</p>
            <Money cents={o.today.revenue_cents} className="mt-1 block text-xl font-bold" />
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Aprovação no cartão (7 dias)</p>
            <p className="num mt-1 text-xl font-bold">{pct(o.card_approval_bps)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Reembolsos no mês</p>
            <p className="num mt-1 text-xl font-bold">{pct(o.refund_rate_bps)}</p>
            <p className="mt-1 text-xs text-muted">Chargebacks: {pct(o.chargeback_rate_bps)}</p>
          </Card>
        </div>

        <Card className="mt-3 p-5">
          <h2 className="mb-6 font-bold">Volume nos últimos 14 dias</h2>
          <Bars data={o.chart} />
        </Card>

        <h2 className="mt-8 text-xl font-extrabold">Atendimento ({q.tickets.length})</h2>
        <p className="mt-1 mb-3 text-sm text-muted">Pedidos de ajuda de compradores. O prazo prometido é de até 1 dia útil.</p>
        {q.tickets.length === 0 ? (
          <Empty title="Nenhum pedido de ajuda em aberto" />
        ) : (
          <div className="space-y-3">
            {q.tickets.map((t) => {
              const late = new Date(t.due_at).getTime() < Date.now();
              return (
                <Card key={t.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm text-muted">
                      <span className="num font-bold text-paper">#{t.number}</span> · {t.user_name} · {t.email}
                      {t.product_name ? ` · ${t.product_name}` : ""}
                    </p>
                    <StatusBadge status={late ? "refused" : "pending"} label={late ? "Prazo vencido" : `Responder até ${formatDateTime(t.due_at)}`} />
                  </div>
                  {t.source === "assistant" && <p className="mt-2 text-xs font-semibold text-accent">Encaminhado pela assistente (IA), com o resumo do caso</p>}
                  <p className="mt-2 rounded-lg bg-ink p-3 text-sm whitespace-pre-line">{t.message}</p>
                  <TicketAnswer id={t.id} />
                </Card>
              );
            })}
          </div>
        )}

        <h2 className="mt-8 text-xl font-extrabold">Fila de aprovação</h2>
        <p className="mt-1 text-sm text-muted">A IA faz a primeira triagem. A decisão final é de uma pessoa.</p>

        <h3 className="mt-5 mb-2 font-bold">Produtos ({q.products.length})</h3>
        {q.products.length === 0 ? (
          <Empty title="Nenhum produto aguardando análise" />
        ) : (
          <div className="space-y-3">
            {q.products.map((p) => {
              const t = TRIAGE[p.review_triage ?? "doubt"]!;
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{p.name}</p>
                      <p className="text-sm text-muted">
                        {p.seller_name} · {p.kyc_status === "approved" ? "conta verificada" : "conta não verificada"} · {p.approved_before} {p.approved_before === 1 ? "produto aprovado" : "produtos aprovados"} antes · {PRODUCT_TYPE_LABEL[p.type]}
                        {p.price_cents ? (
                          <>
                            {" "}
                            · <Money cents={p.price_cents} />
                          </>
                        ) : null}{" "}
                        · enviado {timeAgo(p.updated_at)}
                      </p>
                    </div>
                    <StatusBadge status={t.status} label={t.label} />
                  </div>
                  <p className="mt-2 rounded-lg bg-ink p-3 text-sm">{p.description || "Sem descrição."}</p>
                  <p className="mt-2 text-sm">
                    <span className="text-muted">Motivo da triagem:</span> {p.review_reason}
                  </p>
                  <ProductDecision id={p.id} />
                </Card>
              );
            })}
          </div>
        )}

        <h3 className="mt-6 mb-2 font-bold">Contas em verificação ({q.accounts.length})</h3>
        {q.accounts.length === 0 ? (
          <Empty title="Nenhuma conta aguardando verificação" />
        ) : (
          <div className="space-y-3">
            {q.accounts.map((a) => (
              <Card key={a.id} className="p-4">
                <p className="font-bold">{a.name}</p>
                <p className="text-sm text-muted">
                  {a.email} · conta criada {timeAgo(a.created_at)}
                </p>
                <KycDecision id={a.id} hasDocuments={Boolean(a.documents_sent_at)} />
              </Card>
            ))}
          </div>
        )}

        {q.link_reports.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 font-bold">Links denunciados ({q.link_reports.length})</h3>
            <Card className="divide-y divide-line">
              {q.link_reports.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <p className="num text-sm break-all">{r.url}</p>
                  <p className="text-xs text-muted">denunciado {timeAgo(r.created_at)}</p>
                </div>
              ))}
            </Card>
          </>
        )}
      </main>
  );
}
