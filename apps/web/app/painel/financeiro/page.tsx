import Link from "next/link";
import { Withdraw } from "@/components/painel/withdraw";
import { ButtonLink, Card, Money, Notice, PageTitle, StatusBadge, cx } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDay, formatDateTime } from "@/lib/format";

interface Balance {
  available_cents: number;
  pending_cents: number;
  reserved_cents: number;
  upcoming_releases: { day: string; from_kind: string; amount_cents: number }[];
  kyc_status: string;
  pix_key_masked: string | null;
  withdrawals_blocked_reason: string | null;
  fees: { plain: { label: string; value: string }[] };
  release: { plain: { label: string; value: string }[] };
}
interface Tx {
  id: string;
  kind: string;
  description: string;
  order_id: string | null;
  created_at: string;
  amount_cents: number;
  method: string | null;
}
interface Withdrawal {
  id: string;
  amount_cents: number;
  status: string;
  pix_key_masked: string;
  created_at: string;
}

const TX_NOTE: Record<string, string> = { sale: "taxa já descontada", refund: "valor devolvido ao comprador", withdrawal: "enviado para sua chave Pix", withdrawal_failed: "saque não concluído" };

/** P09 — Financeiro: mostrar o dinheiro com clareza e permitir saque. */
export default async function FinancePage() {
  let balance: Balance;
  try {
    balance = await api<Balance>("/v1/balance");
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <>
          <PageTitle title="Financeiro" />
          <Notice tone="wait">Sua função na equipe não dá acesso ao saldo e aos saques. Peça ao dono da conta se precisar.</Notice>
        </>
      );
    }
    throw err;
  }
  const [{ data: txs }, { data: withdrawals }] = await Promise.all([api<{ data: Tx[] }>("/v1/transactions?limit=30"), api<{ data: Withdrawal[] }>("/v1/withdrawals")]);
  const nextPending = balance.upcoming_releases.find((r) => r.from_kind === "pending");
  const nextReserve = balance.upcoming_releases.find((r) => r.from_kind === "reserved");
  const verified = balance.kyc_status === "approved" && balance.pix_key_masked;

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Financeiro" />
      <Card className="p-5">
        <p className="text-sm text-muted">Disponível para saque</p>
        <Money cents={balance.available_cents} className={cx("mt-1 block text-4xl font-bold", balance.available_cents < 0 ? "text-bad" : "text-brand")} />
        <p className="mt-1.5 text-sm text-muted">
          {balance.available_cents < 0 ? "Saldo negativo por reembolso de uma venda já sacada. Ele é descontado sozinho das próximas vendas." : verified ? `Cai na sua chave Pix ${balance.pix_key_masked} em instantes. Saque grátis.` : "Saque grátis, direto na sua chave Pix."}
        </p>
      </Card>

      <div className="mt-3">
        {balance.withdrawals_blocked_reason ? (
          <Notice tone="bad">Os saques desta conta estão pausados. Motivo: {balance.withdrawals_blocked_reason}. A análise leva até 5 dias úteis e você pode contestar respondendo o e-mail que enviamos.</Notice>
        ) : verified ? (
          <Withdraw availableCents={balance.available_cents} pixKeyMasked={balance.pix_key_masked!} />
        ) : (
          <Card className="p-4">
            <p className="font-bold">{balance.kyc_status === "in_review" ? "Sua identidade está em análise" : "Antes do primeiro saque, confirme sua identidade"}</p>
            <p className="mt-1 text-sm text-muted">{balance.kyc_status === "in_review" ? "Você já pode vender. Seu saldo fica guardado até a verificação ser aprovada." : "Leva cerca de 2 minutos. Você já pode vender enquanto isso; o saldo fica guardado."}</p>
            {balance.kyc_status !== "in_review" && (
              <ButtonLink href="/painel/verificacao" className="mt-3">
                Verificar identidade
              </ButtonLink>
            )}
          </Card>
        )}
      </div>

      <Card className="mt-3">
        <h2 className="px-5 pt-4 pb-1 font-bold">Seu dinheiro</h2>
        <dl className="divide-y divide-line">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt>
              <span className="block font-semibold">A liberar</span>
              <span className="block text-xs text-muted">{nextPending ? `Próxima liberação em ${formatDay(`${String(nextPending.day).slice(0, 10)}T12:00:00Z`)}` : "Nada aguardando liberação"}</span>
            </dt>
            <dd>
              <Money cents={balance.pending_cents} className="font-bold" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt>
              <span className="block font-semibold">Reservado</span>
              <span className="block text-xs text-muted">{nextReserve ? `Reserva de segurança · volta sozinha a partir de ${formatDay(`${String(nextReserve.day).slice(0, 10)}T12:00:00Z`)}` : "Reserva de segurança"}</span>
            </dt>
            <dd>
              <Money cents={balance.reserved_cents} className="font-bold" />
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-3">
        <h2 className="px-5 pt-4 pb-1 font-bold">Extrato</h2>
        {txs.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Cada venda, reembolso e saque aparece aqui, ligado à venda que o originou.</p>
        ) : (
          <ul className="divide-y divide-line">
            {txs.map((t) => {
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.description}</span>
                    <span className="block text-xs text-muted">
                      {formatDateTime(t.created_at)}
                      {TX_NOTE[t.kind] ? ` · ${TX_NOTE[t.kind]}` : ""}
                    </span>
                  </span>
                  <span className={cx("num shrink-0 font-bold", t.amount_cents >= 0 ? "text-ok" : "text-bad")}>
                    {t.amount_cents >= 0 ? "+ " : "− "}
                    {(Math.abs(t.amount_cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </>
              );
              return (
                <li key={t.id}>
                  {t.order_id ? (
                    <Link href={`/painel/vendas/${t.order_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-raised">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-5 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {withdrawals.length > 0 && (
        <Card className="mt-3">
          <h2 className="px-5 pt-4 pb-1 font-bold">Saques</h2>
          <ul className="divide-y divide-line">
            {withdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <Money cents={w.amount_cents} className="block font-bold" />
                  <span className="block text-xs text-muted">
                    {formatDateTime(w.created_at)} · chave {w.pix_key_masked}
                  </span>
                </span>
                <StatusBadge status={w.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-3 p-5" id="taxas">
        <h2 className="font-bold">Minhas taxas e prazos</h2>
        <dl className="mt-2 divide-y divide-line text-sm">
          {[...balance.fees.plain.map((r) => ({ ...r, label: `Taxa · ${r.label}` })), ...balance.release.plain.map((r) => ({ ...r, label: `Prazo · ${r.label}` }))].map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-right font-semibold">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">A taxa aplicada fica gravada em cada venda: o extrato nunca muda depois.</p>
      </Card>
    </div>
  );
}
