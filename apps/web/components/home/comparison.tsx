import { DEFAULT_FEE_TABLE, computeSale } from "@domma/core";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * Comparativo de taxas padrão de cartão (item 12.1 do descritivo, consulta de 15/11/2026).
 * Os concorrentes aparecem sem nome. Antes de divulgar, confirmar os números nas páginas
 * oficiais de cada plataforma — eles mudam com o tempo.
 */
const EXAMPLE_CENTS = 19700;
const net = (percentBps: number, fixedCents: number) => EXAMPLE_CENTS - Math.floor((EXAMPLE_CENTS * percentBps + 5000) / 10000) - fixedCents;
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR")}%`;

const ours = computeSale({ method: "card", priceCents: EXAMPLE_CENTS }, DEFAULT_FEE_TABLE);

const COLUMNS = [
  { name: "Domma Mart", us: true, percentBps: DEFAULT_FEE_TABLE.card.percentBps, fixedCents: DEFAULT_FEE_TABLE.card.fixedCents, netCents: ours.netCents, release: "15 dias", pix: "Dia seguinte" },
  { name: "Concorrente H", percentBps: 990, fixedCents: 249, netCents: net(990, 249), release: "30 dias", pix: "—" },
  { name: "Concorrente K", percentBps: 899, fixedCents: 249, netCents: net(899, 249), release: "Até 15 dias", pix: "—" },
  { name: "Concorrente V", percentBps: 749, fixedCents: 200, netCents: net(749, 200), release: "—", pix: "—" },
  { name: "Concorrente C", percentBps: 499, fixedCents: 249, netCents: net(499, 249), release: "Até 15 dias", pix: "Dia seguinte" },
];

const ROWS: { label: string; hint?: string; value: (c: (typeof COLUMNS)[number]) => string; strong?: boolean }[] = [
  { label: "Taxa no cartão", value: (c) => `${pct(c.percentBps)} + ${brl(c.fixedCents)}` },
  { label: `Você recebe em uma venda de ${brl(EXAMPLE_CENTS)}`, hint: "cartão à vista", value: (c) => brl(c.netCents), strong: true },
  { label: "A cada 100 vendas, fica com você", value: (c) => brl(c.netCents * 100) },
  { label: "Liberação do cartão", value: (c) => c.release },
  { label: "Liberação do Pix", value: (c) => c.pix },
];

export function Comparison() {
  const best = Math.max(...COLUMNS.filter((c) => !c.us).map((c) => c.netCents));
  const extra = (ours.netCents - best) * 100;
  return (
    <div>
      {/* Celular: um cartão por plataforma */}
      <div className="space-y-2.5 md:hidden">
        {COLUMNS.map((c) => (
          <div key={c.name} className={cx("rounded-2xl border p-4", c.us ? "border-brand bg-brand-dim" : "border-line bg-graphite")}>
            <div className="flex items-baseline justify-between gap-3">
              <p className={cx("font-extrabold", c.us && "text-brand")}>{c.name}</p>
              <p className="num text-sm text-muted">
                {pct(c.percentBps)} + {brl(c.fixedCents)}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted">Você recebe em uma venda de {brl(EXAMPLE_CENTS)}</p>
            <p className={cx("num text-2xl font-bold", c.us ? "text-brand" : "text-paper")}>{brl(c.netCents)}</p>
            <p className="mt-1.5 text-xs text-muted">
              Cartão: {c.release === "—" ? "prazo não informado" : c.release.toLowerCase()}
            </p>
          </div>
        ))}
      </div>

      {/* Computador: tabela */}
      <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Comparativo de taxas padrão de cartão entre o Domma Mart e quatro concorrentes</caption>
          <thead>
            <tr className="bg-graphite">
              <th scope="col" className="px-5 py-4 text-left font-semibold text-muted">
                Taxas padrão
              </th>
              {COLUMNS.map((c) => (
                <th key={c.name} scope="col" className={cx("px-4 py-4 text-left font-extrabold", c.us ? "bg-brand text-ink" : "text-paper")}>
                  {c.us && <Check size={15} strokeWidth={3} className="mr-1 inline -translate-y-px" aria-hidden />}
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="px-5 py-4 text-left font-semibold">
                  {row.label}
                  {row.hint && <span className="block text-xs font-normal text-muted">{row.hint}</span>}
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.name} className={cx("num px-4 py-4", c.us ? "bg-brand-dim font-bold text-brand" : "text-paper/80", row.strong && "text-base font-bold", row.strong && !c.us && "text-paper")}>
                    {row.value(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 rounded-xl border border-brand/20 bg-brand-dim px-4 py-3 text-sm">
        A cada 100 vendas de {brl(EXAMPLE_CENTS)} no cartão, sobram <span className="num font-bold text-brand">{brl(extra)}</span> a mais com você do que no concorrente mais barato da tabela.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Taxas padrão de cartão publicadas em comparativos de mercado, consultadas em 15/11/2026; “—” significa que o dado não foi encontrado. Os valores dos concorrentes mudam com o tempo. As taxas do Domma Mart são a proposta inicial e ainda dependem de confirmação com o provedor de pagamento; nos primeiros 30 dias de conta, Pix e cartão liberam em 7 dias.
      </p>
    </div>
  );
}
