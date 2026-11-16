"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, attempt } from "@/lib/api";

export async function requestRefund(orderId: string, reason: string) {
  const result = await attempt(() => api<{ refund_id: string; automatic: boolean }>(`/v1/buyer/orders/${orderId}/refund`, { method: "POST", body: { reason: reason || undefined } }));
  if (!result.ok) return result;
  redirect(`/reembolso/${result.refund_id}`);
}

export async function completeLesson(lessonId: string, productId: string, nextLessonId: string | null) {
  await api(`/v1/buyer/lessons/${lessonId}/progress`, { method: "POST", body: { completed: true } });
  revalidatePath(`/assistir/${productId}`);
  if (nextLessonId) redirect(`/assistir/${productId}?aula=${nextLessonId}`);
}

export async function verifyLink(url: string) {
  return attempt(() => api<{ genuine: boolean; product?: string; seller?: string }>("/v1/public/verify-link", { method: "POST", body: { url }, token: null }));
}

export async function reportLink(url: string) {
  return attempt(() => api("/v1/public/report-link", { method: "POST", body: { url }, token: null }));
}

export async function openTicket(topic: string, message: string, orderId: string | null, idempotencyKey: string) {
  const result = await attempt(() => api<{ number: number; due_at: string }>("/v1/buyer/support", { method: "POST", body: { topic, message, order_id: orderId ?? undefined }, idempotencyKey }));
  revalidatePath("/ajuda");
  return result;
}

export interface AssistantCard {
  type: "link" | "ticket" | "access_sent";
  label?: string;
  href?: string;
  number?: number;
  due_at?: string;
  product?: string;
}
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: AssistantCard[];
  created_at: string;
}

export async function sendAssistantMessage(message: string) {
  const result = await attempt(() => api<{ message: AssistantMessage }>("/v1/buyer/assistant/messages", { method: "POST", body: { message } }));
  // Se a assistente abriu um pedido para a equipe, ele aparece na lista da página.
  if (result.ok && result.message.cards.some((c) => c.type === "ticket")) revalidatePath("/ajuda");
  return result;
}

export async function resetAssistant() {
  const result = await attempt(() => api("/v1/buyer/assistant/reset", { method: "POST" }));
  revalidatePath("/ajuda");
  return result;
}
