"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { api, attempt, setSession } from "@/lib/api";

export interface Quote {
  items_cents: number;
  discount_cents: number;
  total_cents: number;
  installments: { installments: number; installment_cents: number; total_cents: number }[];
}

export interface OrderResult {
  order_id: string;
  token: string;
  status: "pending" | "paid" | "refused";
  buyer_total_cents: number;
  buyer_first_name: string;
  pix?: { copy_paste: string; expires_at: string; qr_svg: string };
  message?: string;
}

export async function startSession(slug: string, utm: Record<string, string>) {
  return attempt(() => api<{ session_id: string }>(`/v1/public/checkout/${slug}/sessions`, { method: "POST", body: { utm }, token: null }));
}

export async function saveFields(sessionId: string, fields: { name?: string; email?: string; phone?: string }) {
  return attempt(() => api(`/v1/public/checkout-sessions/${sessionId}`, { method: "PATCH", body: fields, token: null }));
}

export async function getQuote(slug: string, bumpIds: string[], couponCode?: string) {
  return attempt(() => api<Quote>(`/v1/public/checkout/${slug}/quote`, { method: "POST", body: { bump_ids: bumpIds, coupon_code: couponCode || undefined }, token: null }));
}

export async function placeOrder(slug: string, payload: Record<string, unknown>, idempotencyKey: string) {
  return attempt(async () => {
    const order = await api<OrderResult>(`/v1/public/checkout/${slug}/orders`, { method: "POST", body: payload, token: null, idempotencyKey });
    if (order.pix) {
      // O QR code é desenhado no servidor: a página de pagamento não carrega biblioteca nenhuma para isso.
      order.pix.qr_svg = await QRCode.toString(order.pix.copy_paste, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B0B0C", light: "#FFFFFF" } });
    }
    return order;
  });
}

export async function orderStatus(orderId: string, token: string) {
  return attempt(() => api<{ status: string }>(`/v1/public/orders/${orderId}?token=${encodeURIComponent(token)}`, { token: null }));
}

export async function simulatePix(orderId: string, token: string) {
  return attempt(() => api(`/v1/sandbox/orders/${orderId}/pay`, { method: "POST", body: { token }, token: null }));
}

/** Botão "Acessar meu produto": abre a sessão do comprador e leva direto ao conteúdo. */
export async function openAccess(orderId: string, token: string) {
  const result = await attempt(() => api<{ session_token: string; redirect_to: string }>(`/v1/public/orders/${orderId}/access`, { method: "POST", body: { token }, token: null }));
  if (!result.ok) return result;
  await setSession(result.session_token);
  redirect(result.redirect_to);
}
