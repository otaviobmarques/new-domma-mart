"use client";

import { useState, useTransition } from "react";
import { type KycDocuments, answerTicket, decideKyc, decideProduct, setWithdrawalsBlocked, viewKycDocuments } from "@/app/backoffice/actions";
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

const formatDoc = (d: string) => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"));

/** Documento e selfie lado a lado, para comparar o rosto e os dados. Os endereços vencem em 5 minutos. */
function KycPhotos({ accountId }: { accountId: string }) {
  const [docs, setDocs] = useState<KycDocuments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const load = () =>
    startTransition(async () => {
      const r = await viewKycDocuments(accountId);
      if (r.ok) setDocs(r);
      else setError(r.error);
    });
  if (!docs)
    return (
      <div className="mt-3">
        <Button size="sm" variant="outline" loading={pending} onClick={load}>
          Ver documento e selfie
        </Button>
        <span className="ml-2 text-xs text-muted">Abrir fica registrado.</span>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </div>
    );
  const items = [
    ["Documento (frente)", docs.document_front],
    ["Documento (verso)", docs.document_back],
    ["Selfie com o documento", docs.selfie],
  ] as const;
  return (
    <div className="mt-3">
      <p className="text-sm">
        CPF ou CNPJ informado: <span className="num font-bold">{docs.document_number ? formatDoc(docs.document_number) : "não informado"}</span>
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {items.map(([label, file]) =>
          file ? (
            <figure key={label} className="min-w-0">
              <figcaption className="mb-1 text-xs font-semibold text-muted">{label}</figcaption>
              {file.content_type === "application/pdf" ? (
                <a href={file.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-line p-4 text-sm font-semibold text-accent underline underline-offset-4">
                  Abrir PDF
                </a>
              ) : (
                <a href={file.url} target="_blank" rel="noreferrer">
                  {/* Endereço temporário do armazenamento privado: não passa pelo otimizador de imagens. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.url} alt={label} className="aspect-[4/3] w-full rounded-lg border border-line bg-ink object-contain" />
                </a>
              )}
            </figure>
          ) : null,
        )}
      </div>
      <button type="button" className="mt-2 text-xs font-semibold text-muted underline underline-offset-4" onClick={load} disabled={pending}>
        As imagens pararam de abrir? Carregar de novo
      </button>
    </div>
  );
}

export function KycDecision({ id, hasDocuments }: { id: string; hasDocuments: boolean }) {
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
      {hasDocuments ? <KycPhotos accountId={id} /> : <p className="text-xs text-muted">Esta conta foi enviada antes de pedirmos fotos: não há documento nem selfie para conferir.</p>}
      <input className={`${inputClass} mt-3`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que a pessoa precisa corrigir (para devolver)" aria-label="Observação" />
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

export function TicketAnswer({ id }: { id: string }) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3">
      <textarea className={`${inputClass} h-24 py-2.5`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Resposta para a pessoa (vai por e-mail e aparece na página de ajuda dela)" aria-label="Resposta" />
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <Button
        size="sm"
        className="mt-2"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            if (answer.trim().length < 5) return setError("Escreva a resposta.");
            const r = await answerTicket(id, answer);
            setError(r.ok ? null : r.error);
          })
        }
      >
        Responder
      </Button>
    </div>
  );
}

/** Bloqueio de saque sempre com motivo por escrito, que o produtor vê na tela Financeiro. */
export function WithdrawalsBlock({ accountId, blockedReason }: { accountId: string; blockedReason: string | null }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = Boolean(blockedReason);
  return (
    <div>
      {blocked && (
        <div className="mb-3">
          <Notice tone="bad">Saques pausados. Motivo informado ao produtor: {blockedReason}</Notice>
        </div>
      )}
      <label className="block text-sm font-semibold">
        {blocked ? "Motivo da liberação (fica registrado)" : "Motivo do bloqueio (o produtor vai ler)"}
        <textarea className={`${inputClass} mt-1.5 h-20 py-2.5`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <Button
        className="mt-3"
        variant={blocked ? "outline" : "danger"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            if (reason.trim().length < 5) return setError("Escreva o motivo.");
            const r = await setWithdrawalsBlocked(accountId, !blocked, reason);
            if (r.ok) {
              setReason("");
              setError(null);
            } else setError(r.error);
          })
        }
      >
        {blocked ? "Liberar saques" : "Bloquear saques"}
      </Button>
    </div>
  );
}
