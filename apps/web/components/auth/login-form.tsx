"use client";

import { classifyIdentifier } from "@domma/core";
import { useState, useTransition } from "react";
import { requestCode } from "@/app/auth-actions";
import { Button, Field, inputClass } from "@/components/ui";
import { CodeStep } from "./code-step";

/** C04 — Entrar sem senha, com o e-mail, celular ou CPF usado na compra. */
export function LoginForm({ next }: { next?: string }) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devCode?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) return <CodeStep identifier={identifier} next={next} devCode={sent.devCode} onBack={() => setSent(null)} />;

  const submit = () => {
    if (!classifyIdentifier(identifier)) return setError("Digite o e-mail, o celular com DDD ou o CPF que você usou.");
    setError(null);
    startTransition(async () => {
      const result = await requestCode(identifier);
      if (result.ok) setSent({ devCode: result.dev_code });
      else setError(result.error);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="E-mail, celular ou CPF" error={error}>
        <input className={inputClass} autoFocus autoComplete="username" placeholder="O que você usou na compra" value={identifier} aria-invalid={Boolean(error)} onChange={(e) => setIdentifier(e.target.value)} />
      </Field>
      <Button full size="lg" className="mt-4" loading={pending} type="submit">
        Receber código
      </Button>
    </form>
  );
}
