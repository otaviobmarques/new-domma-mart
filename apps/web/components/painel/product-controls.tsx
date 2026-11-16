"use client";

import { parseBRL } from "@domma/core";
import { useState, useTransition } from "react";
import { createOffer, productAction, updateProduct } from "@/app/painel/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function StatusActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: "publish" | "pause" | "resume") =>
    startTransition(async () => {
      const r = await productAction(id, action);
      setError(r.ok ? null : r.error);
    });
  return (
    <div>
      {status === "draft" && (
        <Button loading={pending} onClick={() => run("publish")}>
          Publicar produto
        </Button>
      )}
      {status === "approved" && (
        <Button variant="outline" loading={pending} onClick={() => run("pause")}>
          Pausar vendas
        </Button>
      )}
      {status === "paused" && (
        <Button loading={pending} onClick={() => run("resume")}>
          Voltar a vender
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

export function EditGeneral({ id, name, description, supportContact }: { id: string; name: string; description: string; supportContact: string | null }) {
  const [fields, setFields] = useState({ name, description, support_contact: supportContact ?? "" });
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await updateProduct(id, { ...fields, support_contact: fields.support_contact || null });
          setState(r.ok ? { ok: true } : { error: r.error });
        });
      }}
    >
      <Field label="Nome">
        <input className={inputClass} value={fields.name} maxLength={120} onChange={(e) => setFields({ ...fields, name: e.target.value })} />
      </Field>
      <Field label="Descrição">
        <textarea className={`${inputClass} h-28 py-2.5`} value={fields.description} maxLength={5000} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
      </Field>
      <Field label="Contato para o comprador" hint="Aparece no rodapé do checkout. Ex.: seu e-mail ou WhatsApp de suporte.">
        <input className={inputClass} value={fields.support_contact} maxLength={120} onChange={(e) => setFields({ ...fields, support_contact: e.target.value })} />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      {state.ok && <Notice tone="ok">Alterações salvas.</Notice>}
      <Button type="submit" loading={pending}>
        Salvar
      </Button>
    </form>
  );
}

export function NewOffer({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({ name: "", price: "", max_installments: 12, interest_payer: "buyer" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        + Nova oferta
      </Button>
    );
  }
  return (
    <form
      className="mt-3 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseBRL(fields.price);
        if (!fields.name.trim() || !cents || cents < 100) return setError("Informe o nome da oferta e um preço a partir de R$ 1,00.");
        startTransition(async () => {
          const r = await createOffer(productId, { name: fields.name, price_cents: cents, max_installments: fields.max_installments, interest_payer: fields.interest_payer });
          if (r.ok) {
            setOpen(false);
            setError(null);
          } else setError(r.error);
        });
      }}
    >
      <Field label="Nome da oferta">
        <input className={inputClass} placeholder="Ex.: Lançamento" value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} />
      </Field>
      <Field label="Preço (R$)">
        <input className={`${inputClass} num`} inputMode="decimal" placeholder="147,00" value={fields.price} onChange={(e) => setFields({ ...fields, price: e.target.value })} />
      </Field>
      <Field label="Parcelamento máximo">
        <select className={inputClass} value={fields.max_installments} onChange={(e) => setFields({ ...fields, max_installments: Number(e.target.value) })}>
          {[1, 2, 3, 6, 10, 12].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "Só à vista" : `Até ${n}x`}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quem paga os juros do parcelamento">
        <select className={inputClass} value={fields.interest_payer} onChange={(e) => setFields({ ...fields, interest_payer: e.target.value })}>
          <option value="buyer">Comprador paga</option>
          <option value="producer">Eu assumo (sem juros para o comprador)</option>
        </select>
      </Field>
      {error && (
        <div className="sm:col-span-2">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={pending}>
          Criar oferta
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
