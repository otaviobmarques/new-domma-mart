"use client";

import { useState, useTransition } from "react";
import { changePixKey, sendConfirmation } from "@/app/painel/actions";
import { Button, Field, Notice, cx, inputClass } from "@/components/ui";

/** Trocar a chave Pix pede o código de confirmação e pausa os saques por 24 horas. */
export function ChangePixKey() {
  const [step, setStep] = useState<"closed" | "key" | "code" | "done">("closed");
  const [pixKey, setPixKey] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string>();
  const [hours, setHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (step === "closed") {
    return (
      <Button variant="outline" size="sm" onClick={() => setStep("key")}>
        Trocar chave Pix
      </Button>
    );
  }
  if (step === "done") return <Notice tone="ok">Chave Pix trocada. Por segurança, os saques voltam em {hours} horas e avisamos você por e-mail.</Notice>;
  return (
    <div className="rounded-xl border border-line p-4">
      {step === "key" ? (
        <>
          <Field label="Nova chave Pix" hint="Precisa estar no mesmo CPF ou CNPJ da conta. Depois da troca, os saques ficam pausados por 24 horas." error={error}>
            <input className={inputClass} value={pixKey} autoFocus onChange={(e) => setPixKey(e.target.value)} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button
              loading={pending}
              onClick={() => {
                if (pixKey.trim().length < 5) return setError("Digite a nova chave Pix.");
                setError(null);
                startTransition(async () => {
                  const r = await sendConfirmation("pix_key");
                  if (!r.ok) return setError(r.error);
                  setDevCode(r.dev_code);
                  setStep("code");
                });
              }}
            >
              Continuar
            </Button>
            <Button variant="ghost" onClick={() => setStep("closed")}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field label="Código de confirmação" hint="Enviamos um código de 6 dígitos para o seu e-mail." error={error}>
            <input className={cx(inputClass, "num text-center text-2xl tracking-[0.4em]")} inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
          {devCode && (
            <div className="mt-3">
              <Notice tone="brand">
                Ambiente de testes: seu código é <span className="num font-bold">{devCode}</span>
              </Notice>
            </div>
          )}
          <Button
            className="mt-3"
            loading={pending}
            disabled={code.length < 6}
            onClick={() =>
              startTransition(async () => {
                const r = await changePixKey(pixKey, code);
                if (!r.ok) return setError(r.error);
                setHours(r.withdrawals_paused_hours);
                setStep("done");
              })
            }
          >
            Trocar chave
          </Button>
        </>
      )}
    </div>
  );
}
