/** Eventos de webhook (item 9.2). Os marcados como fase 2+ já têm nome reservado. */
export const WEBHOOK_EVENTS = [
  "order.created",
  "order.paid",
  "order.refused",
  "order.refunded",
  "order.chargeback",
  "pix.generated",
  "pix.expired",
  "boleto.generated",
  "boleto.expired",
  "cart.abandoned",
  "subscription.created",
  "subscription.renewed",
  "subscription.late",
  "subscription.canceled",
  "access.granted",
  "access.revoked",
  "upload.ready",
  "upload.failed",
  "import.completed",
  "import.failed",
  "withdrawal.completed",
  "withdrawal.failed",
  "affiliate.requested",
  "affiliate.approved",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Intervalos de reenvio: crescentes, por até 72 horas (item 9.4). */
export const WEBHOOK_RETRY_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440, 1440];

export function nextWebhookAttempt(attemptsSoFar: number, from = new Date()): Date | null {
  const minutes = WEBHOOK_RETRY_MINUTES[attemptsSoFar - 1];
  return minutes === undefined ? null : new Date(from.getTime() + minutes * 60_000);
}

export const API_SCOPES = [
  "products:read",
  "products:write",
  "orders:read",
  "orders:write",
  "payments:write",
  "customers:read",
  "enrollments:write",
  "balance:read",
  "withdrawals:write",
  "webhooks:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
