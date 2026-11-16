import { Check, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { ChangePixKey } from "@/components/painel/pix-key";
import { VerificationForm } from "@/components/painel/verification";
import { Card, Notice, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";

/** P02 — Verificação de identidade: valida o titular antes de liberar saques. */
export default async function VerificationPage() {
  const account = await api<{ kyc_status: string; kyc_note: string | null; kyc_requires_documents: boolean; document_masked: string | null; pix_key_masked: string | null }>("/v1/account");
  return (
    <div className="mx-auto max-w-md">
      <Link href="/painel/financeiro" className="mb-3 inline-flex items-center gap-1 text-lg font-extrabold">
        <ChevronLeft size={20} aria-hidden /> Verificar identidade
      </Link>
      {account.kyc_status === "approved" ? (
        <Card className="p-5">
          <StatusBadge status="approved" label="Identidade verificada" />
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Documento</dt>
              <dd className="num">{account.document_masked}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Chave Pix para saque</dt>
              <dd className="num">{account.pix_key_masked}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <ChangePixKey />
          </div>
        </Card>
      ) : account.kyc_status === "in_review" ? (
        <Notice tone="wait">Sua identidade está em análise. Uma pessoa da equipe confere em até 1 dia útil e avisamos por e-mail. Você já pode vender; seu saldo fica guardado até a aprovação.</Notice>
      ) : (
        <>
          <p className="mb-4 text-muted">Precisamos confirmar que a conta é sua antes do primeiro saque. Leva cerca de 2 minutos.</p>
          {account.kyc_status === "pending" && account.kyc_note && (
            <div className="mb-4">
              <Notice tone="wait">Falta um ajuste: {account.kyc_note}</Notice>
            </div>
          )}
          <Card className="p-5">
            <VerificationForm requiresDocuments={account.kyc_requires_documents} />
          </Card>
          <div className="mt-4">
            <Notice tone="ok" icon={<Check size={16} strokeWidth={3} aria-hidden />}>
              Você já pode vender. Seu saldo fica guardado até a verificação ser aprovada.
            </Notice>
          </div>
        </>
      )}
    </div>
  );
}
