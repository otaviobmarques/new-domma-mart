"use client";

import { parseBRL } from "@domma/core";
import { useRef, useState, useTransition } from "react";
import { sendConfirmation, withdraw } from "@/app/painel/actions";
import { Button, Field, Money, Notice, cx, inputClass } from "@/components/ui";

/** Sacar: valor, código de confirmação (segundo fator) e pronto. Só para a chave Pix do titular. */
export function Withdraw({ availableCents, pixKeyMasked }: { availableCents: number; pixKeyMasked: string }) {
  const [step, setStep] = useState<"closed" | "amount" | "code" | "done">("closed");
  const [amount, setAmount] = useState((Math.max(0, availableCents) / 100).toFixed(2).replace(".", ","));
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef("");
  const cents = parseBRL(amount);

  if (step === "closed") {
    return (
      <Button full size="lg" disabled={availableCents < 100} onClick={() => setStep("amount")}>
        Sacar
      </Button>
    );
  }
  if (step === "done") {
    return (
      <Notice tone="ok">
        Saque de <Money cents={cents ?? 0} className="font-bold" /> enviado para a sua chave Pix {pixKeyMasked}.
      </Notice>
    );
  }
  return (
    <div className="rounded-2xl border border-brand/30 bg-graphite p-4">
      {step === "amount" ? (
        <>
          <Field label="Quanto você quer sacar?" hint={`Disponível: ${(availableCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · Saque grátis para a chave Pix ${pixKeyMasked}`} error={error}>
            <div className="relative">
              <span className="num absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">R$</span>
              <input className={cx(inputClass, "num pl-11 text-lg")} inputMode="decimal" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
            </div>
          </Field>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setStep("closed")}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (!cents || cents < 100) return setError("Digite um valor a partir de R$ 1,00.");
                if (cents > availableCents) return setError("Este valor é maior que o disponível.");
                setError(null);
                startTransition(async () => {
                  const r = await sendConfirmation("withdrawal");
                  if (!r.ok) return setError(r.error);
                  setDevCode(r.dev_code);
                  idempotencyKey.current = crypto.randomUUID();
                  setStep("code");
                });
              }}
            >
              Continuar
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field label="Código de confirmação" hint="Enviamos um código de 6 dígitos para o seu e-mail. É a segunda etapa de segurança de todo saque." error={error}>
            <input className={cx(inputClass, "num text-center text-2xl tracking-[0.4em]")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
          {devCode && (
            <div className="mt-3">
              <Notice tone="brand">
                Ambiente de testes: seu código é <span className="num font-bold">{devCode}</span>
              </Notice>
            </div>
          )}
          <Button
            full
            size="lg"
            className="mt-3"
            loading={pending}
            disabled={code.length < 6}
            onClick={() =>
              startTransition(async () => {
                const r = await withdraw(cents!, code, idempotencyKey.current);
                if (r.ok) setStep("done");
                else setError(r.error);
              })
            }
          >
            Sacar <Money cents={cents ?? 0} />
          </Button>
          <button type="button" className="mx-auto mt-3 block text-sm font-semibold text-muted underline underline-offset-4" onClick={() => setStep("amount")}>
            Voltar
          </button>
        </>
      )}
    </div>
  );
}
