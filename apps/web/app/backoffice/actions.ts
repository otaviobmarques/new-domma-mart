"use server";

import { revalidatePath } from "next/cache";
import { api, attempt } from "@/lib/api";

export async function decideProduct(id: string, decision: "approve" | "reject" | "request_changes", reason: string) {
  const result = await attempt(() => api(`/v1/backoffice/products/${id}/decision`, { method: "POST", body: { decision, reason } }));
  revalidatePath("/backoffice");
  return result;
}

export async function decideKyc(id: string, decision: "approve" | "pending", note: string) {
  const result = await attempt(() => api(`/v1/backoffice/accounts/${id}/kyc`, { method: "POST", body: { decision, note } }));
  revalidatePath("/backoffice");
  return result;
}

export async function answerTicket(id: string, answer: string) {
  const result = await attempt(() => api(`/v1/backoffice/tickets/${id}/answer`, { method: "POST", body: { answer } }));
  revalidatePath("/backoffice");
  return result;
}

export async function setWithdrawalsBlocked(accountId: string, blocked: boolean, reason: string) {
  const result = await attempt(() => api(`/v1/backoffice/accounts/${accountId}/withdrawals-block`, { method: "POST", body: { blocked, reason } }));
  revalidatePath(`/backoffice/contas/${accountId}`);
  return result;
}

export async function sendDefense(id: string) {
  const result = await attempt(() => api(`/v1/backoffice/chargebacks/${id}/defense`, { method: "POST" }));
  revalidatePath("/backoffice/risco");
  return result;
}

export async function setChargebackResult(id: string, result: "won" | "lost") {
  const r = await attempt(() => api(`/v1/backoffice/chargebacks/${id}/result`, { method: "POST", body: { result } }));
  revalidatePath("/backoffice/risco");
  return r;
}

export async function simulateChargeback(orderId: string, reason: string) {
  const r = await attempt(() => api(`/v1/backoffice/sandbox/orders/${orderId}/chargeback`, { method: "POST", body: { reason } }));
  revalidatePath("/backoffice/risco");
  return r;
}

export async function requestChange(input: { kind: "account_conditions" | "platform_settings"; account_id?: string; payload: Record<string, unknown>; reason: string }) {
  const r = await attempt(() => api("/v1/backoffice/changes", { method: "POST", body: input }));
  revalidatePath("/backoffice", "layout");
  return r;
}

export async function decideChange(id: string, approve: boolean) {
  const r = await attempt(() => api(`/v1/backoffice/changes/${id}/decision`, { method: "POST", body: { approve } }));
  revalidatePath("/backoffice", "layout");
  return r;
}

export async function sendTestEmail() {
  const r = await attempt(() => api<{ to: string }>("/v1/backoffice/emails/test", { method: "POST" }));
  revalidatePath("/backoffice/emails");
  return r;
}

export async function unblockEmail(email: string) {
  const r = await attempt(() => api("/v1/backoffice/emails/unblock", { method: "POST", body: { email } }));
  revalidatePath("/backoffice/emails");
  return r;
}

export interface KycDocuments {
  status: string;
  sent_at: string;
  document_number: string | null;
  document_front: { url: string; content_type: string } | null;
  document_back: { url: string; content_type: string } | null;
  selfie: { url: string; content_type: string } | null;
}

/** Abrir os documentos fica registrado; os endereços valem por 5 minutos. */
export async function viewKycDocuments(accountId: string) {
  return attempt(() => api<KycDocuments>(`/v1/backoffice/accounts/${accountId}/kyc-documents`));
}
