"use client";

import { Check, Copy, Lock, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

const NAME = "Marina Souza";
const EMAIL = "marina@email.com";
const SALES = [
  { who: "Marina S.", how: "Pix", value: "R$ 197,00" },
  { who: "Carlos A.", how: "Cartão 3x", value: "R$ 224,00" },
  { who: "Juliana P.", how: "Pix", value: "R$ 197,00" },
];

/** Padrão de QR code decorativo (não é um código de verdade). */
function FakeQr() {
  const cells = Array.from({ length: 121 }, (_, i) => {
    const x = i % 11;
    const y = Math.floor(i / 11);
    const corner = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    return corner || (x * 7 + y * 13 + x * y) % 3 === 0;
  });
  return (
    <div className="mx-auto grid size-28 grid-cols-11 gap-px rounded-lg bg-white p-2">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-[#0b0b0c]" : "bg-white"} />
      ))}
    </div>
  );
}

/**
 * Cena de abertura: o checkout sendo preenchido, o Pix gerado e o pagamento aprovado,
 * com as vendas chegando ao lado. Roda em ciclo; com movimento reduzido, fica no último quadro.
 */
export function HeroScene() {
  // 0–100: digitando · 101–160: Pix na tela · 161–230: aprovado
  const [tick, setTick] = useState(230);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setTick(0);
    const id = setInterval(() => setTick((t) => (t >= 260 ? 0 : t + 1)), 70);
    return () => clearInterval(id);
  }, []);

  const typed = (text: string, from: number) => text.slice(0, Math.max(0, Math.min(text.length, Math.floor((tick - from) / 2))));
  const stage = tick <= 100 ? "form" : tick <= 160 ? "pix" : "paid";
  const name = typed(NAME, 6);
  const email = typed(EMAIL, 36);
  const filled = tick > 76;
  const sales = stage === "paid" ? Math.min(SALES.length, 1 + Math.floor((tick - 165) / 22)) : 0;
  const field = "flex h-8 items-center rounded-md border border-line bg-ink px-2 text-[10px]";

  return (
    <div className="relative mx-auto mb-14 w-[280px]" aria-hidden>
      <div className="glow absolute -inset-16 rounded-full bg-brand/15 blur-3xl" />
      <div className="float relative overflow-hidden rounded-[2rem] border border-line bg-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]">
        <div className="flex items-center justify-between border-b border-line bg-graphite px-4 py-3 text-[10px]">
          <span className="rounded border border-dashed border-line px-1.5 py-0.5 font-bold">Sua marca</span>
          <span className="flex items-center gap-1 font-semibold text-ok">
            <Lock size={10} /> Pagamento seguro
          </span>
        </div>

        <div className="h-[412px] p-3">
          {stage === "form" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-line bg-graphite p-2.5">
                <span className="grid size-10 place-items-center rounded-md bg-brand-dim text-[9px] font-bold text-accent">Capa</span>
                <div>
                  <p className="text-[11px] leading-tight font-bold">Curso: do zero à primeira venda</p>
                  <p className="num text-xs font-bold">R$ 197,00</p>
                </div>
              </div>
              <div className="space-y-1.5 rounded-xl border border-line bg-graphite p-2.5">
                <p className="text-[10px] font-bold">Seus dados</p>
                <div className={cx(field, tick < 36 && "border-brand")}>
                  <span className={cx(tick >= 6 && tick < 36 && "caret")}>{name}</span>
                </div>
                <div className={cx(field, tick >= 36 && tick < 76 && "border-brand")}>
                  <span className={cx(tick >= 36 && tick < 76 && "caret")}>{email}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className={cx(field, "num")}>{filled ? "(11) 98765-4321" : ""}</div>
                  <div className={cx(field, "num")}>{filled ? "529.982.247-25" : ""}</div>
                </div>
              </div>
              <div className="rounded-xl border border-line bg-graphite p-2.5">
                <div className="grid grid-cols-2 gap-1.5 text-center text-[10px] font-bold">
                  <span className="rounded-md border border-brand bg-brand-dim py-2 text-accent">Pix</span>
                  <span className="rounded-md border border-line py-2">Cartão</span>
                </div>
                <p className="mt-2 flex items-center gap-1 text-[9px] text-muted">
                  <Zap size={10} className="text-ok" /> Aprovação na hora
                </p>
              </div>
              <div className="flex items-center justify-between px-1 pt-0.5">
                <span className="text-[11px] font-bold">Total</span>
                <span className="num text-sm font-bold">R$ 197,00</span>
              </div>
              <div className={cx("rounded-xl bg-brand py-2.5 text-center text-xs font-bold text-onbrand transition", tick > 90 && "scale-95 brightness-90")}>Gerar Pix</div>
            </div>
          )}

          {stage === "pix" && (
            <div className="pop-in pt-2 text-center">
              <p className="text-xs font-extrabold">Pague com Pix para liberar seu acesso</p>
              <p className="num mt-0.5 text-sm font-bold">R$ 197,00</p>
              <div className="mt-3 rounded-xl border border-line bg-graphite p-3">
                <FakeQr />
                <p className="mt-2 text-[9px] text-muted">
                  Este código vale por <span className="num font-bold text-paper">14:5{9 - Math.min(9, Math.floor((tick - 101) / 7))}</span>
                </p>
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-xs font-bold text-onbrand">
                <Copy size={12} /> Copiar código Pix
              </div>
              <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-wait/20 bg-wait-dim px-2.5 py-2 text-[10px] font-bold text-wait">
                <span className="spin inline-block size-3 rounded-full border-2 border-current border-t-transparent" /> Aguardando pagamento
              </div>
            </div>
          )}

          {stage === "paid" && (
            <div className="pop-in flex h-full flex-col items-center justify-center text-center">
              <span className="relative grid size-14 place-items-center rounded-full bg-ok-dim text-ok">
                <span className="absolute inset-0 rounded-full border border-ok" style={{ animation: "ring 1.4s ease-out infinite" }} />
                <Check size={28} strokeWidth={3} />
              </span>
              <p className="mt-4 text-base leading-tight font-extrabold">
                Pagamento aprovado,
                <br />
                Marina
              </p>
              <p className="mt-1.5 text-[10px] text-muted">Seu acesso já está liberado.</p>
              <div className="mt-4 w-full rounded-xl bg-brand py-2.5 text-xs font-bold text-onbrand">Acessar meu produto</div>
            </div>
          )}
        </div>
      </div>

      {/* Vendas chegando ao painel do produtor */}
      <div className="float-slow absolute top-16 -right-4 w-44 space-y-1.5 sm:-right-24">
        {SALES.slice(0, sales).map((s) => (
          <div key={s.who} className="pop-in flex items-center justify-between gap-2 rounded-xl border border-line bg-graphite/95 px-3 py-2 shadow-xl backdrop-blur">
            <span>
              <span className="block text-[11px] font-bold">{s.who}</span>
              <span className="block text-[9px] text-muted">{s.how} · agora</span>
            </span>
            <span className="text-right">
              <span className="num block text-[11px] font-bold">{s.value}</span>
              <span className="block text-[9px] font-bold text-ok">✓ Aprovada</span>
            </span>
          </div>
        ))}
      </div>
      <div className="float-slow absolute -bottom-12 -left-4 rounded-xl border border-line bg-graphite/95 px-3.5 py-2.5 shadow-xl backdrop-blur sm:-left-28">
        <p className="text-[10px] text-muted">Você vendeu hoje</p>
        <p className="num text-lg font-bold text-accent">{["R$ 1.182,00", "R$ 1.379,00", "R$ 1.603,00", "R$ 1.800,00"][sales]}</p>
      </div>
    </div>
  );
}
