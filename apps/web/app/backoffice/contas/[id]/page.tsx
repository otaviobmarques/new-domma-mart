import { formatBRL, formatBps } from "@domma/core";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WithdrawalsBlock } from "@/components/backoffice/decision";
import { Card, Money, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Conta · Backoffice" };

interface Account {
  id: string;
  name: string;
  email: string;
  status: string;
  kyc_status: string;
  withdrawals_blocked_reason: string | null;
  withdrawal_daily_limit_cents: number | null;
  created_at: string;
  wallet: { available_cents: number; pending_cents: number; reserved_cents: number };
  stats: { sold_30d_cents: number; refunded: number; approved: number };
  fees: { pix: { fixedCents: number }; card: { percentBps: number; fixedCents: number } };
  release_policy: { tier: string; pixReleaseDays: number; cardReleaseDays: number; reserveBps: number; reserveDays: number };
  history: { action: string; actor_kind: string; data: Record<string, unknown>; created_at: string }[];
}

const TIER: Record<string, string> = { new: "Conta nova (primeiros 30 dias)", growing: "De 30 a 90 dias", trusted: "Mais de 90 dias, bons indicadores", custom: "Condição própria" };
const ACTOR: Record<string, string> = { user: "produtor", api_key: "chave de API", backoffice: "equipe Domma", system: "sistema", ai: "IA" };

/** B03 — Conta do produtor (visão completa). Abrir esta tela fica registrado na trilha de auditoria. */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(`/backoffice/contas/${id}`);
  if (!me.user.is_backoffice) notFound();
  let a: Account;
  try {
    a = await api<Account>(`/v1/backoffice/accounts/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const refundRate = a.stats.approved ? `${((a.stats.refunded / a.stats.approved) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="num text-right">{children}</dd>
    </div>
  );
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/backoffice/contas" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ChevronLeft size={16} aria-hidden /> Contas
      </Link>
      <h1 className="text-2xl font-extrabold">{a.name}</h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge status={a.kyc_status === "approved" ? "approved" : a.kyc_status} label={a.kyc_status === "approved" ? "Identidade verificada" : a.kyc_status === "in_review" ? "Identidade em análise" : "Sem verificação"} />
        {a.email} · conta desde {formatDate(a.created_at)}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Vendido em 30 dias", <Money key="a" cents={a.stats.sold_30d_cents} className="text-xl font-bold" />],
          ["Saldo disponível", <Money key="b" cents={a.wallet.available_cents} className="text-xl font-bold" />],
          ["A liberar + reservado", <Money key="c" cents={a.wallet.pending_cents + a.wallet.reserved_cents} className="text-xl font-bold" />],
          ["Reembolsos (30 dias)", <span key="d" className="num text-xl font-bold">{refundRate}</span>],
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <div className="mt-1">{value}</div>
          </Card>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="p-5 text-sm">
          <h2 className="text-base font-bold">Condições desta conta</h2>
          <p className="mt-0.5 text-xs text-muted">{TIER[a.release_policy.tier] ?? a.release_policy.tier}</p>
          <dl className="mt-2 divide-y divide-line">
            <Row label="Cartão">
              {formatBps(a.fees.card.percentBps)} + {formatBRL(a.fees.card.fixedCents)}
            </Row>
            <Row label="Pix">{formatBRL(a.fees.pix.fixedCents)}</Row>
            <Row label="Liberação do Pix">{a.release_policy.pixReleaseDays === 1 ? "dia seguinte" : `${a.release_policy.pixReleaseDays} dias`}</Row>
            <Row label="Liberação do cartão">{a.release_policy.cardReleaseDays} dias</Row>
            <Row label="Reserva de segurança">{a.release_policy.reserveBps ? `${formatBps(a.release_policy.reserveBps)} por ${a.release_policy.reserveDays} dias` : "sem reserva"}</Row>
            <Row label="Limite de saque por dia">{a.withdrawal_daily_limit_cents ? formatBRL(a.withdrawal_daily_limit_cents) : "sem limite"}</Row>
          </dl>
          <p className="mt-3 text-xs text-muted">Alterar taxas, prazos e reserva de uma conta exige dupla aprovação e ainda não está nesta tela.</p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-bold">Saques</h2>
          <WithdrawalsBlock accountId={a.id} blockedReason={a.withdrawals_blocked_reason} />
          <p className="mt-3 text-xs text-muted">O saldo legítimo é pago na data prevista; só fica retido o valor ligado ao que está sendo investigado. O prazo máximo de análise é de 5 dias úteis.</p>
        </Card>
      </div>

      <Card className="mt-3 p-5">
        <h2 className="mb-2 font-bold">Histórico da conta</h2>
        <ul className="divide-y divide-line text-sm">
          {a.history.map((h, i) => (
            <li key={i} className="flex justify-between gap-4 py-2">
              <span>
                <span className="num">{h.action}</span>
                {typeof h.data.reason === "string" && h.data.reason ? <span className="text-muted"> — {h.data.reason}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {ACTOR[h.actor_kind] ?? h.actor_kind} · {formatDateTime(h.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
