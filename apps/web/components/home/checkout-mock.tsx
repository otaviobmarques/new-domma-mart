import { Check, Lock, Zap } from "lucide-react";

/** Miniatura do checkout no celular, desenhada com os mesmos componentes visuais da tela de verdade. */
export function CheckoutMock() {
  const field = "h-8 rounded-md border border-line bg-ink";
  return (
    <div className="relative mx-auto w-[272px]" aria-hidden>
      <div className="absolute -inset-10 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-line bg-ink shadow-2xl">
        <div className="flex items-center justify-between border-b border-line bg-graphite px-4 py-3 text-[10px]">
          <span className="rounded border border-dashed border-line px-1.5 py-0.5 font-bold">Sua marca</span>
          <span className="flex items-center gap-1 font-semibold text-ok">
            <Lock size={10} /> Pagamento seguro
          </span>
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-graphite p-2.5">
            <span className="grid size-10 place-items-center rounded-md bg-brand-dim text-[9px] font-bold text-brand">Capa</span>
            <div>
              <p className="text-[11px] leading-tight font-bold">Curso: do zero à primeira venda</p>
              <p className="num text-xs font-bold">R$ 197,00</p>
            </div>
          </div>
          <div className="space-y-1.5 rounded-xl border border-line bg-graphite p-2.5">
            <p className="text-[10px] font-bold">Seus dados</p>
            <div className={field} />
            <div className={field} />
            <div className="grid grid-cols-2 gap-1.5">
              <div className={field} />
              <div className={field} />
            </div>
          </div>
          <div className="rounded-xl border border-line bg-graphite p-2.5">
            <div className="grid grid-cols-2 gap-1.5 text-center text-[10px] font-bold">
              <span className="rounded-md border border-brand bg-brand-dim py-2 text-brand">Pix</span>
              <span className="rounded-md border border-line py-2">Cartão</span>
            </div>
            <p className="mt-2 flex items-center gap-1 text-[9px] text-muted">
              <Zap size={10} className="text-ok" /> Aprovação na hora
            </p>
          </div>
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[11px] font-bold">Total</span>
            <span className="num text-sm font-bold">R$ 197,00</span>
          </div>
          <div className="rounded-xl bg-brand py-2.5 text-center text-xs font-bold text-ink">Gerar Pix</div>
        </div>
      </div>
      <div className="absolute top-24 -right-6 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-dim px-3 py-2 text-xs font-bold text-ok shadow-xl sm:-right-16">
        <Check size={14} strokeWidth={3} /> Pagamento aprovado
      </div>
      <div className="absolute bottom-28 -left-6 rounded-xl border border-line bg-graphite px-3 py-2 shadow-xl sm:-left-20">
        <p className="text-[10px] text-muted">Você vendeu hoje</p>
        <p className="num text-base font-bold text-brand">R$ 1.379,00</p>
      </div>
    </div>
  );
}
