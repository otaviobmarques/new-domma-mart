"use client";

import { useState, useTransition } from "react";
import { sendTestEmail, unblockEmail } from "@/app/backoffice/actions";
import { Button, Notice } from "@/components/ui";

export function TestEmail() {
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await sendTestEmail();
            setMessage(r.ok ? { tone: "ok", text: `Teste enviado para ${r.to}. Confira a caixa de entrada e o spam.` } : { tone: "bad", text: r.error });
          })
        }
      >
        Enviar um teste para mim
      </Button>
      {message && (
        <div className="mt-2">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
    </div>
  );
}

export function Unblock({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-bad">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await unblockEmail(email);
            setError(r.ok ? null : r.error);
          })
        }
      >
        Desbloquear
      </Button>
    </span>
  );
}
