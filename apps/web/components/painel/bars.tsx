import { cx } from "@/components/ui";

/** Gráfico simples de barras; o último dia (hoje) fica em amarelo. */
export function Bars({ data }: { data: { day: string; total_cents: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total_cents));
  const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="flex h-40 items-end gap-1" role="img" aria-label={`Vendas por dia nos últimos ${data.length} dias`}>
      {data.map((d, i) => {
        const [, month, day] = d.day.split("-");
        return (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div className={cx("w-full rounded-t-sm", i === data.length - 1 ? "bg-brand" : "bg-[#5a5a61] group-hover:bg-[#8a8a92]")} style={{ height: `${Math.max(2, (d.total_cents / max) * 100)}%` }} />
            <span className="num pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-raised px-1.5 py-0.5 text-[11px] whitespace-nowrap group-hover:block">
              {day}/{month} · {brl(d.total_cents)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
