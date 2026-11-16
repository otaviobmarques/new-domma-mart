"use client";

import Link from "next/link";
import { formatPhone, isValidEmail, isValidPhone } from "@domma/core";
import { useState, useTransition } from "react";
import { signup } from "@/app/auth-actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { CodeStep } from "./code-step";

/** P01 — Cadastro em menos de 1 minuto: sem senha, confirmação por código. */
export function SignupForm() {
  const [fields, setFields] = useState({ name: "", email: "", phone: "", intent: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ identifier: string; devCode?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) return <CodeStep identifier={sent.identifier} next="/painel" devCode={sent.devCode} onBack={() => setSent(null)} />;

  const submit = () => {
    const next: Record<string, string> = {};
    if (fields.name.trim().length < 2) next.name = "Digite seu nome e sobrenome.";
    if (!isValidEmail(fields.email)) next.email = "Confira o e-mail.";
    if (!isValidPhone(fields.phone)) next.phone = "Digite o celular com DDD.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setFormError(null);
    startTransition(async () => {
      const result = await signup(fields);
      if (result.ok) setSent({ identifier: result.identifier, devCode: result.dev_code });
      else setFormError(result.error);
    });
  };

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields({ ...fields, [key]: key === "phone" ? formatPhone(e.target.value) : e.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Seu nome" error={errors.name}>
        <input className={inputClass} autoComplete="name" placeholder="Nome e sobrenome" value={fields.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} />
      </Field>
      <Field label="E-mail" error={errors.email}>
        <input className={inputClass} type="email" autoComplete="email" placeholder="voce@email.com" value={fields.email} onChange={set("email")} aria-invalid={Boolean(errors.email)} />
      </Field>
      <Field label="Celular (WhatsApp)" error={errors.phone}>
        <input className={inputClass} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(00) 00000-0000" value={fields.phone} onChange={set("phone")} aria-invalid={Boolean(errors.phone)} />
      </Field>
      <Field label="O que você quer vender? (opcional)" hint="A Domma IA usa sua resposta para já deixar o primeiro produto pronto.">
        <input className={inputClass} placeholder="Ex.: um curso de confeitaria" value={fields.intent} onChange={set("intent")} maxLength={500} />
      </Field>
      {formError && <Notice tone="bad">{formError}</Notice>}
      <Button full size="lg" loading={pending} type="submit">
        Criar conta
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">
        Ao criar a conta, você concorda com os{" "}
        <Link href="/termos" className="underline" target="_blank">
          Termos de Uso
        </Link>
        , com o{" "}
        <Link href="/termos/produtores" className="underline" target="_blank">
          Contrato do Produtor
        </Link>{" "}
        e com a{" "}
        <Link href="/privacidade" className="underline" target="_blank">
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}
