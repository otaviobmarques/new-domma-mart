"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, attempt } from "@/lib/api";

export interface Draft {
  name: string;
  description: string;
  type: string;
  price_cents: number;
  guarantee_days: number;
  modules: { title: string; lessons: { title: string }[] }[];
  source: "model" | "local";
}

export async function createProducerAccount() {
  await api("/v1/account", { method: "POST", body: {} });
  redirect("/painel");
}

export async function generateDraft(description: string) {
  return attempt(() => api<Draft>("/v1/ai/product-draft", { method: "POST", body: { description } }));
}

/** Cria o produto e publica em seguida. Nada vai ao ar sem o clique do produtor. */
export async function createAndPublish(draft: Draft, aiGenerated: boolean, idempotencyKey: string) {
  return attempt(async () => {
    const product = await api<{ id: string; offers: { checkout_url: string }[] }>("/v1/products", {
      method: "POST",
      idempotencyKey,
      body: {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        guarantee_days: draft.guarantee_days,
        ai_generated: aiGenerated,
        offer: { price_cents: draft.price_cents },
        modules: draft.modules,
      },
    });
    const published = await api<{ status: string; review_reason: string | null }>(`/v1/products/${product.id}/publish`, { method: "POST" });
    revalidatePath("/painel", "layout");
    return { id: product.id, status: published.status, checkout_url: product.offers[0]!.checkout_url };
  });
}

export async function productAction(id: string, action: "publish" | "pause" | "resume") {
  const result = await attempt(() => api(`/v1/products/${id}/${action}`, { method: "POST" }));
  revalidatePath("/painel", "layout");
  return result;
}

export async function updateProduct(id: string, body: Record<string, unknown>) {
  const result = await attempt(() => api(`/v1/products/${id}`, { method: "PATCH", body }));
  revalidatePath(`/painel/produtos/${id}`);
  return result;
}

export async function createOffer(productId: string, body: Record<string, unknown>) {
  const result = await attempt(() => api(`/v1/products/${productId}/offers`, { method: "POST", body }));
  revalidatePath(`/painel/produtos/${productId}`);
  return result;
}

export async function refundOrder(orderId: string, reason: string) {
  const result = await attempt(() => api(`/v1/orders/${orderId}/refund`, { method: "POST", body: { reason: reason || undefined } }));
  revalidatePath("/painel", "layout");
  return result;
}

export async function denyRefund(orderId: string, reason: string) {
  const result = await attempt(() => api(`/v1/orders/${orderId}/refund/deny`, { method: "POST", body: { reason } }));
  revalidatePath(`/painel/vendas/${orderId}`);
  return result;
}

export async function resendAccess(orderId: string) {
  return attempt(() => api(`/v1/orders/${orderId}/resend-access`, { method: "POST" }));
}

export async function sendConfirmation(purpose: "withdrawal" | "pix_key" | "api_key") {
  return attempt(() => api<{ dev_code?: string }>("/v1/auth/confirmation-code", { method: "POST", body: { purpose } }));
}

export async function withdraw(amountCents: number, code: string, idempotencyKey: string) {
  const result = await attempt(() => api<{ status: string; pix_key_masked: string }>("/v1/withdrawals", { method: "POST", body: { amount_cents: amountCents, confirmation_code: code }, idempotencyKey }));
  revalidatePath("/painel", "layout");
  return result;
}

export async function submitVerification(document: string, pixKey: string) {
  const result = await attempt(() => api<{ kyc_status: string }>("/v1/account/verification", { method: "POST", body: { document, pix_key: pixKey } }));
  revalidatePath("/painel", "layout");
  return result;
}

export async function createApiKey(name: string, scopes: string[], code: string) {
  const result = await attempt(() => api<{ key: string }>("/v1/api-keys", { method: "POST", body: { name, scopes, confirmation_code: code } }));
  revalidatePath("/painel/configuracoes");
  return result;
}

export async function revokeApiKey(id: string) {
  await api(`/v1/api-keys/${id}`, { method: "DELETE" });
  revalidatePath("/painel/configuracoes");
}

export async function createWebhook(url: string, events: string[]) {
  const result = await attempt(() => api<{ secret: string }>("/v1/webhooks", { method: "POST", body: { url, events } }));
  revalidatePath("/painel/configuracoes");
  return result;
}

export async function deleteWebhook(id: string) {
  await api(`/v1/webhooks/${id}`, { method: "DELETE" });
  revalidatePath("/painel/configuracoes");
}

export async function addBump(offerId: string, productId: string, bumpOfferId: string, title: string) {
  const result = await attempt(() => api(`/v1/offers/${offerId}/bumps`, { method: "POST", body: { bump_offer_id: bumpOfferId, title } }));
  revalidatePath(`/painel/produtos/${productId}`);
  return result;
}

export async function removeBump(bumpId: string, productId: string) {
  await api(`/v1/bumps/${bumpId}`, { method: "DELETE" });
  revalidatePath(`/painel/produtos/${productId}`);
}

export async function createCoupon(productId: string, body: { code: string; kind: "percent" | "fixed"; value: number; max_uses?: number }) {
  const result = await attempt(() => api("/v1/coupons", { method: "POST", body: { ...body, product_id: productId } }));
  revalidatePath(`/painel/produtos/${productId}`);
  return result;
}

export async function disableCoupon(couponId: string, productId: string) {
  await api(`/v1/coupons/${couponId}`, { method: "DELETE" });
  revalidatePath(`/painel/produtos/${productId}`);
}

export async function changePixKey(pixKey: string, code: string) {
  const result = await attempt(() => api<{ withdrawals_paused_hours: number }>("/v1/account/pix-key", { method: "PUT", body: { pix_key: pixKey, confirmation_code: code } }));
  revalidatePath("/painel", "layout");
  return result;
}

export async function saveCheckout(offerId: string, productId: string, config: unknown, publish: boolean) {
  const result = await attempt(() => api<{ draft: unknown | null }>(`/v1/offers/${offerId}/checkout`, { method: "PUT", body: { config, publish } }));
  revalidatePath(`/painel/produtos/${productId}`, "layout");
  return result;
}

// ── Editor da área de membros (P07)

export async function saveContentOrder(productId: string, modules: { id: string; lessons: string[] }[]) {
  return attempt(() => api(`/v1/products/${productId}/content/order`, { method: "PUT", body: { modules } }));
}

export async function createModule(productId: string, title: string) {
  return attempt(() => api<{ id: string; title: string }>(`/v1/products/${productId}/modules`, { method: "POST", body: { title } }));
}

export async function renameModule(moduleId: string, title: string) {
  return attempt(() => api(`/v1/modules/${moduleId}`, { method: "PATCH", body: { title } }));
}

export async function deleteModule(moduleId: string) {
  return attempt(() => api(`/v1/modules/${moduleId}`, { method: "DELETE" }));
}

export async function createLesson(moduleId: string, title: string) {
  return attempt(() => api<{ id: string }>(`/v1/modules/${moduleId}/lessons`, { method: "POST", body: { title } }));
}

export async function saveLesson(lessonId: string, body: Record<string, unknown>) {
  return attempt(() => api(`/v1/lessons/${lessonId}`, { method: "PATCH", body }));
}

export async function deleteLesson(lessonId: string) {
  return attempt(() => api(`/v1/lessons/${lessonId}`, { method: "DELETE" }));
}

export async function sendChargebackEvidence(orderId: string, text: string) {
  const r = await attempt(() => api(`/v1/orders/${orderId}/chargeback/evidence`, { method: "POST", body: { text } }));
  revalidatePath(`/painel/vendas/${orderId}`);
  return r;
}
