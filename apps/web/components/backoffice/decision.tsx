"use client";

import { useState, useTransition } from "react";
import { decideKyc, decideProduct } from "@/app/backoffice/actions";
import { Button, Notice, inputClass } from "@/components/ui";

/** Toda decisão fica registrada com usuário, data e motivo (B02). */
export function ProductDecision({ id }: { id: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (decision: "approve" | "reject" | "request_changes") =>
    startTransition(async () => {
      const r = await decideProduct(id, decision, reason);
      setError(r.ok ? null : r.error);
    });
  return (
    <div className="mt-3">
      <label className="block text-sm font-semibold">
        Motivo da decisão (fica registrado)
        <textarea className={`${inputClass} mt-1.5 h-20 py-2.5`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatório para recusar ou pedir correção" />
      </label>
      {error && (
        <div className="mt-2">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button loading={pending} onClick={() => run("request_changes")}>
          Pedir correção ao produtor
        </Button>
        <Button variant="outline" loading={pending} onClick={() => run("approve")}>
          Aprovar
        </Button>
        <Button variant="danger" loading={pending} onClick={() => run("reject")}>
          Recusar
        </Button>
      </div>
    </div>
  );
}

export function KycDecision({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (decision: "approve" | "pending") =>
    startTransition(async () => {
      const r = await decideKyc(id, decision, note);
      setError(r.ok ? null : r.error);
    });
  return (
    <div className="mt-3">
      <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que a pessoa precisa corrigir (para devolver)" aria-label="Observação" />
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" loading={pending} onClick={() => run("approve")}>
          Aprovar
        </Button>
        <Button size="sm" variant="outline" loading={pending} onClick={() => run("pending")}>
          Devolver para correção
        </Button>
      </div>
    </div>
  );
}
