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
