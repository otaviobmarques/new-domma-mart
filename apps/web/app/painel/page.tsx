import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { Bars } from "@/components/painel/bars";
import { ButtonLink, Card, Money, StatusBadge, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { paymentLabel, timeAgo } from "@/lib/format";
import { requireMe } from "@/lib/session";

interface Dashboard {
  today: { total_cents: number; count: number };
  month: { total_cents: number; count: number };
  wallet: { available_cents: number } | null;
  chart: { day: string; total_cents: number }[];
  last_sales: { id: string; status: string; method: string; installments: number; gross_cents: number; created_at: string; product_name: string; buyer_name: string }[];
  onboarding: { has_product: boolean; identity_verified: boolean; has_sale: boolean };
}

/** P03 — Início: o essencial em uma olhada. Detalhes ficam em Vendas. */
export default async function PanelHome() {
  const me = await requireMe("/painel");
  const d = await api<Dashboard>("/v1/dashboard");
  const steps = [
    { done: d.onboarding.has_product, label: "Criar seu primeiro produto", href: "/painel/produtos/novo" },
    { done: d.onboarding.identity_verified, label: "Verificar sua identidade (para sacar)", href: "/painel/verificacao" },
    { done: d.onboarding.has_sale, label: "Fazer a primeira venda", href: "/painel/produtos" },
  ];
  const isNew = !d.onboarding.has_sale;
  const count = (n: number) => `${n} ${n === 1 ? "venda aprovada" : "vendas aprovadas"}`;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Olá, {me.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">Veja como estão suas vendas hoje.</p>
        </div>
        <ButtonLink href="/painel/produtos/novo" className="hidden sm:inline-flex">
          <Plus size={16} aria-hidden /> Criar produto com IA
        </ButtonLink>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted">Você vendeu hoje</p>
          <Money cents={d.today.total_cents} className="mt-1 block text-4xl font-bold text-accent" />
          <p className="mt-1.5 text-sm text-muted">{count(d.today.count)}</p>
        </Card>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Card className="p-5">
            <p className="text-sm text-muted">Neste mês</p>
            <Money cents={d.month.total_cents} className="mt-1 block text-xl font-bold" />
            <p className="mt-1.5 text-xs text-muted">{count(d.month.count)}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">Disponível para saque</p>
            {d.wallet ? <Money cents={d.wallet.available_cents} className={cx("mt-1 block text-xl font-bold", d.wallet.available_cents < 0 && "text-bad")} /> : <p className="mt-1 text-sm text-muted">Sem acesso ao saldo</p>}
            {d.wallet && (
              <ButtonLink href="/painel/financeiro" variant={d.wallet.available_cents > 0 ? "primary" : "outline"} size="sm" className="mt-2.5">
                Sacar
              </ButtonLink>
            )}
          </Card>
        </div>
      </div>

      {isNew && (
        <Card className="mt-3 p-5">
          <h2 className="font-bold">3 passos para a primeira venda</h2>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 rounded-lg border border-line px-3 py-3 hover:bg-raised">
                  <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold", s.done ? "bg-ok-dim text-ok" : "border border-line text-muted")}>
                    {s.done ? <Check size={14} strokeWidth={3} aria-label="Concluído" /> : i + 1}
                  </span>
                  <span className={cx("font-semibold", s.done && "text-muted line-through")}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {!isNew && (
        <Card className="mt-3 p-5">
          <h2 className="mb-6 font-bold">Vendas nos últimos 30 dias</h2>
          <Bars data={d.chart} />
        </Card>
      )}

      <Card className="mt-3">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-bold">Últimas vendas</h2>
          <Link href="/painel/vendas" className="text-sm font-semibold text-accent underline underline-offset-4">
            Ver todas
          </Link>
        </div>
        {d.last_sales.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Suas vendas aparecem aqui assim que acontecem.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.last_sales.map((s) => (
              <li key={s.id}>
                <Link href={`/painel/vendas/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-raised">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.product_name}</span>
                    <span className="block text-xs text-muted">
                      {s.buyer_name} · {paymentLabel(s.method, s.installments)} · {timeAgo(s.created_at)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Money cents={s.gross_cents} className="font-bold" />
                    <StatusBadge status={s.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
