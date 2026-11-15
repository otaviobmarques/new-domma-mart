"use client";

import { DEFAULT_FEE_TABLE, type FeeTable, computeSale, parseBRL } from "@domma/core";
import { useState } from "react";
import { Card, Field, Money, cx, inputClass } from "@/components/ui";

/** Simulador público de taxas (M13): o produtor informa o preço e vê quanto recebe. */
export function FeeSimulator({ fees = DEFAULT_FEE_TABLE }: { fees?: FeeTable }) {
  const [input, setInput] = useState("197,00");
  const price = parseBRL(input);
  const valid = price !== null && price >= 100;
  const pix = valid ? computeSale({ method: "pix", priceCents: price }, fees) : null;
  const card = valid ? computeSale({ method: "card", priceCents: price }, fees) : null;
  return (
    <Card className="p-5">
      <Field label="Preço do seu produto" hint={valid ? undefined : "Digite um valor a partir de R$ 1,00."}>
        <div className="relative">
          <span className="num absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">R$</span>
          <input className={cx(inputClass, "num pl-11 text-lg")} inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Preço do produto em reais" />
        </div>
      </Field>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          { label: "Venda no Pix", sale: pix },
          { label: "Venda no cartão", sale: card },
        ].map(({ label, sale }) => (
          <div key={label} className="rounded-xl bg-ink p-3.5">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xs text-muted">Você recebe</p>
            {sale ? <Money cents={sale.netCents} className="text-xl font-bold text-brand" /> : <span className="num text-xl text-muted">—</span>}
            <p className="num mt-1 text-xs text-muted">{sale ? `taxa de ${(sale.feeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " "}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Saque grátis para a sua chave Pix. Valores da proposta inicial de taxas, sujeitos a confirmação.</p>
    </Card>
  );
}
