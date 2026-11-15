import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SaleActions } from "@/components/painel/sale-actions";
import { Card, Money, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatDateTime, paymentLabel } from "@/lib/format";

interface Sale {
  id: string;
  number: number;
  status: string;
  method: string;
  installments: number;
  gross_cents: number;
  discount_cents: number;
  buyer_total_cents: number;
  interest_cents: number;
  fee_cents: number;
  net_cents: number;
  origin: string;
  utm: Record<string, string>;
  refusal_reason: string | null;
  card_last4: string | null;
  paid_at: string | null;
  created_at: string;
  customer: { name: string; email: string; phone: string | null };
  items: { kind: string; title: string; price_cents: number }[];
  refund: { status: string; reason: string | null } | null;
  releases: { from_kind: string; amount_cents: number; release_at: string; status: string }[];
}

const REFUSAL: Record<string, string> = {
  insufficient_funds: "Cartão sem limite",
  card_declined: "Banco não autorizou",
  invalid_card: "Dados do cartão não conferem",
  suspected_fraud: "Suspeita de fraude",
  processing_error: "Erro ao falar com o banco",
};

/** Detalhe da venda: comprador, itens, valores (bruto, taxa, líquido), origem e liberação. */
export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s: Sale;
  try {
    s = await api<Sale>(`/v1/orders/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const Row = ({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) => (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "text-right font-bold" : "text-right"}>{children}</dd>
    </div>
  );
  const whatsapp = s.customer.phone ? `https://wa.me/55${s.customer.phone.replace(/\D/g, "")}` : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/painel/vendas" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ChevronLeft size={16} aria-hidden /> Vendas
      </Link>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Venda #{s.number}</h1>
        <StatusBadge status={s.status} />
      </div>

      <Card className="p-4">
        <h2 className="font-bold">Comprador</h2>
        <p className="mt-1.5">{s.customer.name}</p>
        <p className="text-sm text-muted">
          {s.customer.email}
          {s.customer.phone ? ` · ${s.customer.phone}` : ""}
        </p>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand underline underline-offset-4">
            Falar pelo WhatsApp
          </a>
        )}
      </Card>

      <Card className="mt-3 p-4 text-sm">
        <h2 className="mb-1 text-base font-bold">Valores</h2>
        <dl className="divide-y divide-line">
          {s.items.map((item, i) => (
            <Row key={i} label={`${item.title}${item.kind === "bump" ? " (order bump)" : ""}`}>
              <Money cents={item.price_cents} />
            </Row>
          ))}
          {s.discount_cents > 0 && (
            <Row label="Desconto do cupom">
              <Money cents={-s.discount_cents} />
            </Row>
          )}
          <Row label="Valor da venda">
            <Money cents={s.gross_cents} />
          </Row>
          <Row label="Taxa do Domma Mart">
            <Money cents={-s.fee_cents} />
          </Row>
          {s.interest_cents > 0 && s.buyer_total_cents === s.gross_cents && (
            <Row label="Juros do parcelamento (assumidos por você)">
              <Money cents={-s.interest_cents} />
            </Row>
          )}
          <Row label="Você recebe" strong>
            <Money cents={s.net_cents} className="text-brand" />
          </Row>
        </dl>
        {s.buyer_total_cents > s.gross_cents && (
          <p className="mt-2 text-xs text-muted">
            O comprador pagou <Money cents={s.buyer_total_cents} /> no total: os juros do parcelamento ficam por conta dele.
          </p>
        )}
      </Card>

      <Card className="mt-3 p-4 text-sm">
        <h2 className="mb-1 text-base font-bold">Pagamento</h2>
        <dl className="divide-y divide-line">
          <Row label="Forma">
            {paymentLabel(s.method, s.installments)}
            {s.card_last4 ? ` · final ${s.card_last4}` : ""}
          </Row>
          <Row label="Pedido feito em">{formatDateTime(s.created_at)}</Row>
          {s.paid_at && <Row label="Pago em">{formatDateTime(s.paid_at)}</Row>}
          {s.refusal_reason && <Row label="Motivo da recusa">{REFUSAL[s.refusal_reason] ?? s.refusal_reason}</Row>}
          <Row label="Origem">{Object.keys(s.utm).length ? Object.entries(s.utm).map(([k, v]) => `${k.replace("utm_", "")}: ${v}`).join(" · ") : "Direto"}</Row>
          {s.releases.map((r, i) => (
            <Row key={i} label={r.from_kind === "reserved" ? "Reserva de segurança" : "Liberação do valor"}>
              <Money cents={r.amount_cents} /> · {r.status === "released" ? "já disponível" : r.status === "canceled" ? "cancelada (reembolso)" : `disponível em ${formatDate(r.release_at)}`}
            </Row>
          ))}
        </dl>
      </Card>

      {s.status === "paid" && (
        <div className="mt-4">
          <SaleActions orderId={s.id} netCents={s.net_cents} buyerTotalCents={s.buyer_total_cents} refundRequested={s.refund?.status === "requested"} />
        </div>
      )}
    </div>
  );
}
