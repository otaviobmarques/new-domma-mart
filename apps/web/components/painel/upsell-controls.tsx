"use client";

import { parseBRL } from "@domma/core";
import { useState, useTransition } from "react";
import { addBump, createCoupon } from "@/app/painel/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function NewBump({ offerId, productId, options }: { offerId: string; productId: string; options: { offerId: string; name: string }[] }) {
  const [target, setTarget] = useState(options[0]?.offerId ?? "");
  const [title, setTitle] = useState(options[0] ? `Leve também: ${options[0].name}` : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (options.length === 0) return <p className="text-sm text-muted">Para oferecer um order bump, tenha outro produto aprovado na sua conta.</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim().length < 3) return setError("Escreva a chamada que aparece no checkout.");
        startTransition(async () => {
          const r = await addBump(offerId, productId, target, title);
          setError(r.ok ? null : r.error);
        });
      }}
    >
      <Field label="Produto oferecido">
        <select
          className={inputClass}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setTitle(`Leve também: ${options.find((o) => o.offerId === e.target.value)?.name ?? ""}`);
          }}
        >
          {options.map((o) => (
            <option key={o.offerId} value={o.offerId}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Chamada no checkout">
        <input className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" loading={pending} className="h-12">
        Adicionar
      </Button>
      {error && (
        <div className="sm:col-span-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </form>
  );
}

export function NewCoupon({ productId }: { productId: string }) {
  const [fields, setFields] = useState({ code: "", kind: "percent" as "percent" | "fixed", value: "", maxUses: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const value = fields.kind === "percent" ? Number(fields.value.replace(",", ".")) : parseBRL(fields.value);
        if (!/^[A-Za-z0-9_-]{3,30}$/.test(fields.code.trim())) return setError("O código tem de 3 a 30 letras ou números, sem espaços.");
        if (!value || value <= 0 || (fields.kind === "percent" && (!Number.isInteger(value) || value > 100))) return setError(fields.kind === "percent" ? "O percentual é um número inteiro de 1 a 100." : "Digite o valor do desconto em reais.");
        const maxUses = fields.maxUses ? Number(fields.maxUses) : undefined;
        startTransition(async () => {
          const r = await createCoupon(productId, { code: fields.code.trim(), kind: fields.kind, value, max_uses: maxUses && maxUses > 0 ? maxUses : undefined });
          if (r.ok) {
            setFields({ code: "", kind: fields.kind, value: "", maxUses: "" });
            setError(null);
          } else setError(r.error);
        });
      }}
    >
      <Field label="Código">
        <input className={`${inputClass} num uppercase`} placeholder="BEMVINDO" value={fields.code} onChange={(e) => setFields({ ...fields, code: e.target.value })} />
      </Field>
      <Field label="Tipo">
        <select className={inputClass} value={fields.kind} onChange={(e) => setFields({ ...fields, kind: e.target.value as "percent" | "fixed", value: "" })}>
          <option value="percent">Percentual</option>
          <option value="fixed">Valor fixo</option>
        </select>
      </Field>
      <Field label={fields.kind === "percent" ? "Desconto (%)" : "Desconto (R$)"}>
        <input className={`${inputClass} num`} inputMode="decimal" placeholder={fields.kind === "percent" ? "10" : "20,00"} value={fields.value} onChange={(e) => setFields({ ...fields, value: e.target.value })} />
      </Field>
      <Field label="Limite de usos">
        <input className={`${inputClass} num`} inputMode="numeric" placeholder="Sem limite" value={fields.maxUses} onChange={(e) => setFields({ ...fields, maxUses: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <Button type="submit" variant="outline" loading={pending} className="h-12">
        Criar
      </Button>
      {error && (
        <div className="sm:col-span-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </form>
  );
}
