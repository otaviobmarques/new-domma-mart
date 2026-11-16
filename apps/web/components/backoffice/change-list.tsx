import Link from "next/link";
import { ChangeDecision } from "@/components/backoffice/changes";
import { StatusBadge } from "@/components/ui";
import { type Change, describeChange } from "@/lib/changes";
import { formatDateTime } from "@/lib/format";

const STATUS = { pending: { status: "in_review", label: "Aguardando aprovação" }, approved: { status: "approved", label: "Aprovada" }, rejected: { status: "failed", label: "Recusada" } };

/** Pedidos de alteração: o que muda, quem pediu, o motivo e a decisão. */
export function ChangeList({ changes, showAccount }: { changes: Change[]; showAccount?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {changes.map((c) => (
        <li key={c.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {showAccount && c.account_id && (
                <Link href={`/backoffice/contas/${c.account_id}`} className="font-semibold text-accent">
                  {c.account_name}
                </Link>
              )}
              <ul className="font-semibold">
                {describeChange(c.payload).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <StatusBadge {...STATUS[c.status]} />
          </div>
          <p className="mt-1 text-muted">Motivo: {c.reason}</p>
          <p className="mt-0.5 text-xs text-muted">
            Pedido por {c.requested_by_name} em {formatDateTime(c.created_at)}
            {c.decided_by_name && c.decided_at ? ` · ${c.status === "approved" ? "aprovado" : "recusado"} por ${c.decided_by_name} em ${formatDateTime(c.decided_at)}` : ""}
          </p>
          {c.status === "pending" && <ChangeDecision id={c.id} mine={c.mine} />}
        </li>
      ))}
    </ul>
  );
}
