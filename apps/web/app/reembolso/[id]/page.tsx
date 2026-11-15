import { Check, ChevronLeft, Clock, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Cover, Money, Notice, cx } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, paymentLabel } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Seu reembolso" };

interface Refund {
  id: string;
  order_id: string;
  status: string;
  amount_cents: number;
  refund_ref: string | null;
  method: string;
  installments: number;
  product_name: string;
  cover_url: string | null;
  events: { step: string; message: string; created_at: string }[];
  next: { title: string; message: string; depends_on: string } | null;
  done: boolean;
  support: { message: string };
}

const STEP_TITLE: Record<string, (r: Refund) => string> = {
  requested: () => "Pedido recebido",
  approved: () => "Reembolso aprovado",
  sent: (r) => (r.method === "pix" ? "Pix devolvido" : "Estorno enviado ao cartão"),
  available: () => "Valor disponível para você",
  denied: () => "Reembolso não aprovado",
};

/** C07 — Acompanhar reembolso: mostra, sem a pessoa perguntar, em que pé está. */
export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMe(`/reembolso/${id}`);
  let refund: Refund;
  try {
    refund = await api<Refund>(`/v1/buyer/refunds/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const denied = refund.status === "denied";

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-graphite">
        <div className="mx-auto flex h-14 max-w-md items-center px-4">
          <Link href="/compras" className="flex items-center gap-1.5 text-lg font-extrabold">
            <ChevronLeft size={20} aria-hidden /> Seu reembolso
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        <Card className="flex items-center gap-3.5 p-4">
          <Cover src={refund.cover_url} size={52} />
          <div>
            <p className="font-bold">{refund.product_name}</p>
            <p className="text-sm text-muted">
              {paymentLabel(refund.method, refund.installments)} · <Money cents={refund.amount_cents} />
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <ol>
            {refund.events.map((e, i) => {
              const last = i === refund.events.length - 1 && !refund.next;
              return (
                <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                  {!last && <span className="absolute top-7 left-[13px] h-[calc(100%-1.75rem)] w-px bg-line" aria-hidden />}
                  <span className={cx("grid size-7 shrink-0 place-items-center rounded-full", e.step === "denied" ? "bg-bad-dim text-bad" : "bg-ok-dim text-ok")}>
                    {e.step === "denied" ? <X size={14} strokeWidth={3} aria-hidden /> : <Check size={14} strokeWidth={3} aria-hidden />}
                  </span>
                  <div>
                    <p className="font-bold">{STEP_TITLE[e.step]?.(refund) ?? e.step}</p>
                    <p className="text-xs text-muted">{formatDateTime(e.created_at)}</p>
                    <p className="mt-0.5 text-sm text-muted">{e.message}</p>
                  </div>
                </li>
              );
            })}
            {refund.next && (
              <li className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-wait text-wait">
                  <Clock size={14} aria-hidden />
                </span>
                <div>
                  <p className="font-bold">{refund.next.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{refund.next.message}</p>
                  <p className="mt-0.5 text-xs text-muted">Depende de: {refund.next.depends_on}</p>
                </div>
              </li>
            )}
          </ol>
        </Card>

        {!denied && (
          <Notice tone="ok" icon={<Check size={16} strokeWidth={3} aria-hidden />}>
            {refund.done ? "Reembolso concluído. O valor já voltou para você." : "Você não precisa fazer mais nada. Avisamos por e-mail a cada etapa."}
          </Notice>
        )}

        {refund.refund_ref && (
          <Card className="p-4">
            <p className="text-sm font-bold">Comprovante</p>
            <p className="mt-1 text-sm text-muted">Se o banco pedir, informe o identificador da devolução:</p>
            <p className="num mt-2 rounded-lg bg-ink px-3 py-2 text-sm break-all select-all">{refund.refund_ref}</p>
          </Card>
        )}

        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-bold">Algo não bate?</p>
            <p className="text-xs text-muted">{refund.support.message}</p>
          </div>
          <Link href={`/ajuda?assunto=refund&pedido=${refund.order_id}`} className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-raised">
            Falar com alguém
          </Link>
        </Card>
      </main>
    </div>
  );
}
