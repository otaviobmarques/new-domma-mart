import Link from "next/link";
import { Card, Empty, Money, PageTitle, StatusBadge, cx, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDay, formatTime, paymentLabel } from "@/lib/format";

interface Order {
  id: string;
  status: string;
  method: string;
  installments: number;
  gross_cents: number;
  origin: string;
  created_at: string;
  product_name: string;
  customer: { name: string };
}
interface Response {
  data: Order[];
  funnel: { visits: number; started: number; payment_generated: number; paid: number };
}

const PERIODS = [
  ["today", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
] as const;
const STATUSES = [
  ["", "Todos os status"],
  ["paid", "Aprovadas"],
  ["pending", "Aguardando"],
  ["refused", "Recusadas"],
  ["refunded", "Reembolsadas"],
] as const;

/** P08 — Vendas: acompanhar e tratar vendas. */
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ period?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const period = PERIODS.some(([p]) => p === sp.period) ? sp.period! : "today";
  const status = STATUSES.some(([s]) => s && s === sp.status) ? sp.status! : "";
  const q = (sp.q ?? "").trim();
  const query = new URLSearchParams({ period, ...(status ? { status } : {}), ...(q ? { q } : {}) });
  const { data, funnel } = await api<Response>(`/v1/orders?${query}`);
  const link = (patch: Record<string, string>) => `/painel/vendas?${new URLSearchParams({ period, ...(status ? { status } : {}), ...(q ? { q } : {}), ...patch })}`;
  const steps = [
    ["Visitas ao checkout", funnel.visits],
    ["Começaram a preencher", funnel.started],
    ["Pagamentos gerados", funnel.payment_generated],
    ["Aprovadas", funnel.paid],
  ] as const;

  return (
    <>
      <PageTitle title="Vendas" />
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(([value, label]) => (
          <Link key={value} href={link({ period: value })} aria-current={period === value ? "true" : undefined} className={cx("rounded-full border px-4 py-2 text-sm font-semibold", period === value ? "border-brand bg-brand-dim text-brand" : "border-line hover:bg-raised")}>
            {label}
          </Link>
        ))}
        <form className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-auto" action="/painel/vendas">
          <input type="hidden" name="period" value={period} />
          <select name="status" defaultValue={status} aria-label="Status" className={cx(inputClass, "h-10 w-auto text-sm")}>
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={q} placeholder="Nome, e-mail ou CPF do comprador" aria-label="Buscar venda" className={cx(inputClass, "h-10 min-w-0 flex-1 text-sm")} />
          <button className="h-10 shrink-0 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-raised">Buscar</button>
        </form>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {steps.map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="num mt-1 text-2xl font-bold">{value}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
              <div className="h-full rounded-full bg-brand" style={{ width: `${funnel.visits ? Math.min(100, (value / funnel.visits) * 100) : 0}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        {data.length === 0 ? (
          <Empty title="Nenhuma venda neste filtro">Mude o período ou a busca para ver outras vendas.</Empty>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {data.map((o) => (
                <li key={o.id}>
                  <Link href={`/painel/vendas/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{o.customer.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {o.product_name} · {paymentLabel(o.method, o.installments)} · {period === "today" ? formatTime(o.created_at) : `${formatDay(o.created_at)} ${formatTime(o.created_at)}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Money cents={o.gross_cents} className="font-bold" />
                      <StatusBadge status={o.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
