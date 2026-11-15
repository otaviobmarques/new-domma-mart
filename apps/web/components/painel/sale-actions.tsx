"use client";

import { useState, useTransition } from "react";
import { denyRefund, refundOrder, resendAccess } from "@/app/painel/actions";
import { Button, Money, Notice, inputClass } from "@/components/ui";

/** Reembolso exige confirmação e mostra o impacto no saldo antes de concluir (P08). */
export function SaleActions({ orderId, netCents, buyerTotalCents, refundRequested }: { orderId: string; netCents: number; buyerTotalCents: number; refundRequested: boolean }) {
  const [mode, setMode] = useState<"idle" | "refund" | "deny">(refundRequested ? "refund" : "idle");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await resendAccess(orderId);
                setMessage(r.ok ? { tone: "ok", text: "Link de acesso reenviado para o e-mail do comprador." } : { tone: "bad", text: r.error });
              })
            }
          >
            Reenviar acesso
          </Button>
          <Button variant="danger" onClick={() => setMode("refund")}>
            Reembolsar
          </Button>
        </div>
      )}
      {mode !== "idle" && (
        <div className="rounded-xl border border-line p-4">
          <p className="font-bold">{mode === "refund" ? (refundRequested ? "O comprador pediu reembolso fora da garantia" : "Reembolsar esta venda?") : "Recusar o pedido de reembolso"}</p>
          {mode === "refund" && (
            <p className="mt-1 text-sm text-muted">
              O comprador recebe <Money cents={buyerTotalCents} className="text-paper" /> de volta e perde o acesso. Saem <Money cents={netCents} className="text-paper" /> do seu saldo; a taxa da venda é devolvida a você.
            </p>
          )}
          <label className="mt-3 block text-sm font-semibold">
            {mode === "deny" ? "Motivo (o comprador vai ler)" : "Motivo (opcional)"}
            <textarea className={`${inputClass} mt-1.5 h-20 py-2.5`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {mode === "refund" ? (
              <>
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await refundOrder(orderId, reason);
                      if (r.ok) {
                        setMode("idle");
                        setMessage({ tone: "ok", text: "Reembolso aprovado. O comprador foi avisado." });
                      } else setMessage({ tone: "bad", text: r.error });
                    })
                  }
                >
                  Confirmar reembolso
                </Button>
                {refundRequested && (
                  <Button variant="outline" onClick={() => setMode("deny")}>
                    Recusar pedido
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="outline"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    if (reason.trim().length < 3) return setMessage({ tone: "bad", text: "Escreva o motivo da recusa." });
                    const r = await denyRefund(orderId, reason);
                    if (r.ok) {
                      setMode("idle");
                      setMessage({ tone: "ok", text: "Pedido recusado. O comprador vê o motivo na tela dele." });
                    } else setMessage({ tone: "bad", text: r.error });
                  })
                }
              >
                Confirmar recusa
              </Button>
            )}
            {!refundRequested && (
              <Button variant="ghost" onClick={() => setMode("idle")}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
