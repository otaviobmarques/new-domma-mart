"use client";

import { isValidDocument } from "@domma/core";
import { useState, useTransition } from "react";
import { submitVerification } from "@/app/painel/actions";
import { Button, ButtonLink, Field, Notice, inputClass } from "@/components/ui";

export function VerificationForm() {
  const [document, setDocument] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [errors, setErrors] = useState<{ document?: string; pixKey?: string; form?: string }>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status) {
    return (
      <div className="space-y-3">
        <Notice tone={status === "approved" ? "ok" : "wait"}>{status === "approved" ? "Identidade verificada. Você já pode sacar." : "Recebemos seus dados. A análise costuma sair em poucos minutos; você já pode vender enquanto isso."}</Notice>
        <ButtonLink href="/painel/financeiro" full>
          Ir para o Financeiro
        </ButtonLink>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const next: typeof errors = {};
        if (!isValidDocument(document)) next.document = "CPF ou CNPJ inválido. Confira os números.";
        if (pixKey.trim().length < 5) next.pixKey = "Digite a chave Pix que vai receber os saques.";
        setErrors(next);
        if (Object.keys(next).length) return;
        startTransition(async () => {
          const r = await submitVerification(document, pixKey);
          if (r.ok) setStatus(r.kyc_status);
          else setErrors({ form: r.error });
        });
      }}
    >
      <Field label="CPF ou CNPJ do titular" error={errors.document}>
        <input className={`${inputClass} num`} inputMode="numeric" placeholder="000.000.000-00" value={document} onChange={(e) => setDocument(e.target.value)} aria-invalid={Boolean(errors.document)} />
      </Field>
      <Field label="Chave Pix para saque" hint="Precisa estar no mesmo CPF ou CNPJ da conta. Pode ser CPF/CNPJ, e-mail, celular ou chave aleatória." error={errors.pixKey}>
        <input className={inputClass} value={pixKey} onChange={(e) => setPixKey(e.target.value)} aria-invalid={Boolean(errors.pixKey)} />
      </Field>
      {errors.form && <Notice tone="bad">{errors.form}</Notice>}
      <Button full size="lg" type="submit" loading={pending}>
        Enviar para verificação
      </Button>
    </form>
  );
}
