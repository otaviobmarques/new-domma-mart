"use client";

import { API_SCOPES, WEBHOOK_EVENTS } from "@domma/core";
import { useState, useTransition } from "react";
import { createApiKey, createWebhook, sendConfirmation } from "@/app/painel/actions";
import { Button, Field, Notice, cx, inputClass } from "@/components/ui";
import { CopyButton } from "./copy-button";

const SCOPE_LABEL: Record<string, string> = {
  "products:read": "Ver produtos",
  "products:write": "Criar e alterar produtos",
  "orders:read": "Ver vendas",
  "orders:write": "Reembolsar e reenviar acesso",
  "payments:write": "Criar cobranças",
  "customers:read": "Ver compradores",
  "enrollments:write": "Liberar e revogar acesso",
  "balance:read": "Ver saldo e extrato",
  "withdrawals:write": "Sacar (não disponível por chave)",
  "webhooks:write": "Gerenciar webhooks",
};

/** Criar chave pede confirmação em duas etapas; a chave completa aparece uma única vez. */
export function NewApiKey() {
  const [step, setStep] = useState<"closed" | "form" | "code" | "done">("closed");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["products:read", "orders:read"]);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string>();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (step === "closed") return <Button onClick={() => setStep("form")}>+ Criar chave</Button>;
  if (step === "done") {
    return (
      <div className="rounded-xl border border-brand/40 bg-brand-dim p-4">
        <p className="font-bold text-accent">Copie sua chave agora</p>
        <p className="mt-1 text-sm">Ela não aparece de novo. Se perder, revogue e crie outra.</p>
        <p className="num mt-3 rounded-lg bg-ink px-3 py-2 text-sm break-all select-all">{key}</p>
        <div className="mt-3 flex gap-2">
          <CopyButton text={key} label="Copiar chave" variant="primary" />
          <Button variant="ghost" onClick={() => setStep("closed")}>
            Já copiei
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line p-4">
      {step === "form" ? (
        <>
          <Field label="Nome da chave" hint="Para você lembrar onde ela é usada. Ex.: Site próprio.">
            <input className={inputClass} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </Field>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold">O que esta chave pode fazer</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_SCOPES.filter((s) => s !== "withdrawals:write").map((scope) => (
                <label key={scope} className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="size-4 accent-[#FFD600]" checked={scopes.includes(scope)} onChange={(e) => setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))} />
                  {SCOPE_LABEL[scope] ?? scope}
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <div className="mt-3">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              loading={pending}
              onClick={() => {
                if (name.trim().length < 2 || scopes.length === 0) return setError("Dê um nome e escolha pelo menos uma permissão.");
                setError(null);
                startTransition(async () => {
                  const r = await sendConfirmation("api_key");
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
                const r = await createApiKey(name, scopes, code);
                if (!r.ok) return setError(r.error);
                setKey(r.key);
                setStep("done");
              })
            }
          >
            Criar chave
          </Button>
        </>
      )}
    </div>
  );
}

export function NewWebhook() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["order.paid", "order.refunded"]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const phase1 = WEBHOOK_EVENTS.filter((e) => /^(order|pix|access|withdrawal)\./.test(e) && e !== "order.chargeback");

  if (secret) {
    return (
      <div className="rounded-xl border border-brand/40 bg-brand-dim p-4">
        <p className="font-bold text-accent">Webhook cadastrado. Guarde o segredo.</p>
        <p className="mt-1 text-sm">Use para validar a assinatura de cada entrega. Ele não aparece de novo.</p>
        <p className="num mt-3 rounded-lg bg-ink px-3 py-2 text-sm break-all select-all">{secret}</p>
        <div className="mt-3 flex gap-2">
          <CopyButton text={secret} label="Copiar segredo" variant="primary" />
          <Button
            variant="ghost"
            onClick={() => {
              setSecret("");
              setOpen(false);
              setUrl("");
            }}
          >
            Já copiei
          </Button>
        </div>
      </div>
    );
  }
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        + Novo webhook
      </Button>
    );
  }
  return (
    <form
      className="rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await createWebhook(url.trim(), events);
          if (r.ok) setSecret(r.secret);
          else setError(r.error);
        });
      }}
    >
      <Field label="Endereço que recebe os avisos" error={error}>
        <input className={cx(inputClass, "num text-sm")} placeholder="https://seusite.com.br/webhooks/domma" inputMode="url" value={url} autoFocus onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold">Quais avisos enviar</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {phase1.map((event) => (
            <label key={event} className="num flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-[#FFD600]" checked={events.includes(event)} onChange={(e) => setEvents(e.target.checked ? [...events, event] : events.filter((x) => x !== event))} />
              {event}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex gap-2">
        <Button type="submit" loading={pending}>
          Cadastrar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
