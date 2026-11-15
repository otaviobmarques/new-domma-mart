"use client";

import { useEffect, useState, useTransition } from "react";
import { requestCode, verifyCode } from "@/app/auth-actions";
import { Button, Card, Notice, cx } from "@/components/ui";

/** Código de 6 dígitos: vale 10 minutos e só pode ser usado uma vez. */
export function CodeStep({ identifier, next, devCode, onBack }: { identifier: string; next?: string; devCode?: string; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(devCode);
  const [wait, setWait] = useState(45);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = (value: string) => {
    setError(null);
    startTransition(async () => {
      const result = await verifyCode(identifier, value, next);
      if (result && !result.ok) {
        setError(result.error);
        setCode("");
      }
    });
  };

  return (
    <Card className="p-5">
      <label htmlFor="code" className="block text-base font-bold">
        Digite o código de 6 dígitos
      </label>
      <p className="mt-1 text-sm text-muted">Enviamos para o seu e-mail. Se não chegar, confira a caixa de spam.</p>
      <input
        id="code"
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          const value = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(value);
          if (value.length === 6) submit(value);
        }}
        className={cx("num mt-4 h-14 w-full rounded-lg border border-line bg-ink text-center text-3xl tracking-[0.5em] outline-none focus:border-brand", error && "border-bad")}
      />
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      {hint && (
        <div className="mt-3">
          <Notice tone="brand">
            Ambiente de testes: seu código é <span className="num font-bold">{hint}</span>
          </Notice>
        </div>
      )}
      <Button full size="lg" className="mt-4" loading={pending} disabled={code.length < 6} onClick={() => submit(code)}>
        Entrar
      </Button>
      <p className="mt-4 text-center text-sm text-muted">
        O código vale por 10 minutos.{" "}
        {wait > 0 ? (
          <>
            Reenviar em <span className="num text-paper">0:{String(wait).padStart(2, "0")}</span>
          </>
        ) : (
          <button
            type="button"
            className="font-bold text-brand underline underline-offset-4"
            onClick={async () => {
              setWait(45);
              const result = await requestCode(identifier);
              if (result.ok) setHint(result.dev_code);
            }}
          >
            Reenviar código
          </button>
        )}
      </p>
      <button type="button" className="mx-auto mt-3 block text-sm font-semibold text-muted underline underline-offset-4" onClick={onBack}>
        Usar outro e-mail, celular ou CPF
      </button>
    </Card>
  );
}
