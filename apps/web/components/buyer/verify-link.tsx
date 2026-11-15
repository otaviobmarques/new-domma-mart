"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { reportLink, verifyLink } from "@/app/buyer-actions";
import { Button, Field, cx, inputClass } from "@/components/ui";

type Result = { genuine: boolean; product?: string; seller?: string };

export function VerifyLink() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [pending, startTransition] = useTransition();

  const check = () => {
    if (url.trim().length < 4) return setError("Cole o link completo que você recebeu.");
    setError(null);
    setReported(false);
    startTransition(async () => {
      const r = await verifyLink(url.trim());
      if (r.ok) setResult(r);
      else setError(r.error);
    });
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <Field label="Link recebido" error={error}>
          <input
            className={cx(inputClass, "num text-sm")}
            placeholder="https://..."
            value={url}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => {
              setUrl(e.target.value);
              setResult(null);
            }}
          />
        </Field>
        <Button full size="lg" className="mt-4" loading={pending} type="submit">
          Verificar
        </Button>
      </form>

      <div aria-live="polite" className="mt-4">
        {result?.genuine && (
          <div className="rounded-2xl border border-ok/40 bg-ok-dim p-4">
            <p className="flex items-center gap-2 font-bold text-ok">
              <ShieldCheck size={18} aria-hidden /> Link verdadeiro
            </p>
            <p className="mt-1.5 text-sm">Este checkout é do Domma Mart.</p>
            <p className="mt-1 text-sm text-paper/70">
              Produto: {result.product} · Produtor: {result.seller}
            </p>
          </div>
        )}
        {result && !result.genuine && (
          <div className="rounded-2xl border border-bad/50 bg-bad-dim p-4">
            <p className="flex items-center gap-2 font-bold text-bad">
              <TriangleAlert size={18} aria-hidden /> Não reconhecemos este link
            </p>
            <p className="mt-1.5 text-sm">Não pague. Ele não é um checkout do Domma Mart.</p>
            {reported ? (
              <p className="mt-3 text-sm font-semibold text-ok">Denúncia recebida. Obrigado por avisar — vamos pedir a remoção.</p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={async () => {
                  const r = await reportLink(url.trim());
                  if (r.ok) setReported(true);
                }}
              >
                Denunciar este link
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
