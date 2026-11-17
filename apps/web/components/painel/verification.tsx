"use client";

import { isValidDocument } from "@domma/core";
import { Camera, Check, IdCard } from "lucide-react";
import { useState, useTransition } from "react";
import { submitVerificationWithDocuments } from "@/app/painel/actions";
import { Button, ButtonLink, Field, Notice, Spinner, inputClass } from "@/components/ui";
import { uploadFile } from "@/lib/upload";

type Slot = { state: "empty" } | { state: "sending"; percent: number } | { state: "ready"; fileId: string; name: string } | { state: "error"; message: string };
const MAX = 10 * 1024 * 1024;

/** Um campo de foto: escolhe (ou tira na hora, no celular), envia e mostra que chegou. */
function PhotoField({ label, hint, icon, accept, capture, purpose, slot, onChange }: { label: string; hint: string; icon: React.ReactNode; accept: string; capture?: "user" | "environment"; purpose: "kyc_document" | "kyc_selfie"; slot: Slot; onChange: (slot: Slot) => void }) {
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX) return onChange({ state: "error", message: "A foto passa de 10 MB. Tire outra com menos resolução." });
    onChange({ state: "sending", percent: 0 });
    const r = await uploadFile(file, purpose, { onProgress: (percent) => onChange({ state: "sending", percent }) });
    onChange(r.ok ? { state: "ready", fileId: r.fileId, name: file.name } : { state: "error", message: r.error });
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-sm transition hover:bg-raised ${slot.state === "ready" ? "border-ok/50" : slot.state === "error" ? "border-bad/60" : "border-line"}`}>
        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${slot.state === "ready" ? "bg-ok-dim text-ok" : "bg-raised text-accent"}`}>{slot.state === "ready" ? <Check size={18} strokeWidth={3} aria-hidden /> : slot.state === "sending" ? <Spinner /> : icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{slot.state === "ready" ? slot.name : slot.state === "sending" ? `Enviando… ${slot.percent}%` : "Tirar foto ou escolher arquivo"}</span>
          <span className={`block text-xs ${slot.state === "error" ? "text-bad" : "text-muted"}`}>{slot.state === "error" ? slot.message : slot.state === "ready" ? "Recebido. Toque para trocar." : hint}</span>
        </span>
        <input type="file" className="sr-only" accept={accept} capture={capture} disabled={slot.state === "sending"} onChange={(e) => pick(e.target.files?.[0])} />
      </label>
    </div>
  );
}

export function VerificationForm({ requiresDocuments }: { requiresDocuments: boolean }) {
  const [document, setDocument] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [front, setFront] = useState<Slot>({ state: "empty" });
  const [back, setBack] = useState<Slot>({ state: "empty" });
  const [selfie, setSelfie] = useState<Slot>({ state: "empty" });
  const [errors, setErrors] = useState<{ document?: string; pixKey?: string; form?: string }>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sending = [front, back, selfie].some((s) => s.state === "sending");

  if (status) {
    return (
      <div className="space-y-3">
        <Notice tone={status === "approved" ? "ok" : "wait"}>
          {status === "approved" ? "Identidade verificada. Você já pode sacar." : "Recebemos seus dados e suas fotos. Uma pessoa da equipe confere em até 1 dia útil e avisamos por e-mail. Você já pode vender enquanto isso."}
        </Notice>
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
        if (requiresDocuments && (front.state !== "ready" || selfie.state !== "ready")) next.form = "Envie a foto do documento e a selfie para continuar.";
        setErrors(next);
        if (Object.keys(next).length) return;
        startTransition(async () => {
          const r = await submitVerificationWithDocuments({
            document,
            pix_key: pixKey,
            document_front_file_id: front.state === "ready" ? front.fileId : undefined,
            document_back_file_id: back.state === "ready" ? back.fileId : undefined,
            selfie_file_id: selfie.state === "ready" ? selfie.fileId : undefined,
          });
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
      {requiresDocuments && (
        <>
          <PhotoField label="Documento com foto (frente)" hint="RG, CNH ou passaporte. Foto nítida, sem cortar as bordas. JPG, PNG ou PDF." icon={<IdCard size={18} aria-hidden />} accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" purpose="kyc_document" slot={front} onChange={setFront} />
          <PhotoField label="Verso do documento (se houver)" hint="Para RG e CNH em papel. Na CNH digital, não precisa." icon={<IdCard size={18} aria-hidden />} accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" purpose="kyc_document" slot={back} onChange={setBack} />
          <PhotoField label="Selfie segurando o documento" hint="Seu rosto e o documento precisam aparecer bem. Sem óculos escuros ou boné." icon={<Camera size={18} aria-hidden />} accept="image/jpeg,image/png,image/webp" capture="user" purpose="kyc_selfie" slot={selfie} onChange={setSelfie} />
          <p className="text-xs text-muted">As fotos ficam guardadas em área privada e só a equipe de verificação abre, com registro de quem viu. Veja a nossa Política de Privacidade.</p>
        </>
      )}
      {errors.form && <Notice tone="bad">{errors.form}</Notice>}
      <Button full size="lg" type="submit" loading={pending} disabled={sending}>
        Enviar para verificação
      </Button>
    </form>
  );
}
