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
