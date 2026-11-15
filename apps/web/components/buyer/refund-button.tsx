"use client";

import { useState, useTransition } from "react";
import { requestRefund } from "@/app/buyer-actions";
import { Button, Notice, inputClass } from "@/components/ui";

/** Reembolso em uma tela: confirmação, motivo opcional e processamento automático dentro da garantia. */
export function RefundButton({ orderId, productName, daysLeft }: { orderId: string; productName: string; daysLeft: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="text-sm font-semibold text-brand underline underline-offset-4" onClick={() => setOpen(true)}>
        Pedir reembolso
      </button>
    );
  }
  return (
    <div className="mt-3 w-full rounded-xl border border-line bg-ink p-4">
      <p className="font-bold">Pedir o reembolso de {productName}?</p>
      <p className="mt-1 text-sm text-muted">
        {daysLeft > 0
          ? "Você está dentro da garantia: o reembolso é aprovado na hora e o valor volta pela mesma forma de pagamento. O acesso ao conteúdo é encerrado."
          : "O prazo de garantia já passou, então o produtor é quem decide. Você acompanha a resposta aqui."}
      </p>
      <label className="mt-3 block text-sm font-semibold">
        Quer contar o motivo? (opcional)
        <textarea className={`${inputClass} mt-1.5 h-20 py-2.5`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>
          Voltar
        </Button>
        <Button
          variant="danger"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await requestRefund(orderId, reason);
              if (result && !result.ok) setError(result.error);
            })
          }
        >
          Confirmar reembolso
        </Button>
      </div>
    </div>
  );
}
