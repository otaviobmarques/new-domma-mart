import { randomToken, signWebhook, verifyWebhook } from "../crypto.ts";
import type { CardChargeResult, CardRefusalReason, PaymentProvider, ProviderEvent } from "./provider.ts";

/**
 * Provedor simulado para desenvolvimento, testes e o ambiente de testes da API.
 * Nenhum dinheiro real se move. O Pix é "pago" chamando o endpoint de simulação,
 * que envia uma notificação assinada exatamente como um provedor real faria.
 */
export const SANDBOX_CARD_TOKENS: Record<string, { result: "approved" | CardRefusalReason; last4: string }> = {
  tok_test_approved: { result: "approved", last4: "4242" },
  tok_test_insufficient_funds: { result: "insufficient_funds", last4: "9995" },
  tok_test_declined: { result: "card_declined", last4: "0002" },
  tok_test_fraud: { result: "suspected_fraud", last4: "0019" },
};

export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  constructor(private readonly webhookSecret: string) {}

  async createPixCharge(input: { reference: string; amountCents: number; expiresInSeconds: number }) {
    const providerRef = `sbx_pix_${randomToken(12)}`;
    const amount = (input.amountCents / 100).toFixed(2);
    // Formato parecido com o BR Code, mas marcado como simulado: não é pagável em banco nenhum.
    const copyPaste = `00020126580014BR.GOV.BCB.PIX0136SANDBOX-${providerRef}520400005303986540${amount.length}${amount}5802BR5910DOMMA MART6009SAO PAULO62070503***6304SBOX`;
    return { providerRef, copyPaste, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000) };
  }

  async createCardCharge(input: { cardToken: string }): Promise<CardChargeResult> {
    const providerRef = `sbx_card_${randomToken(12)}`;
    const card = SANDBOX_CARD_TOKENS[input.cardToken];
    if (!card) return { status: "refused", providerRef, reason: "invalid_card" };
    if (card.result !== "approved") return { status: "refused", providerRef, reason: card.result };
    return { status: "approved", providerRef, cardLast4: card.last4, cardBrand: "visa" };
  }

  async refund() {
    return { refundRef: `sbx_refund_${randomToken(12)}` };
  }

  async createPayout() {
    return { providerRef: `sbx_payout_${randomToken(12)}` };
  }

  /** Monta a notificação assinada que o provedor enviaria. */
  buildWebhook(event: { type: ProviderEvent["type"]; providerRef: string; reason?: string; dueAt?: string }) {
    const body = JSON.stringify({ ...event, at: new Date().toISOString() });
    return { body, headers: { "sandbox-signature": signWebhook(body, this.webhookSecret) } };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ProviderEvent | null {
    if (!verifyWebhook(rawBody, headers["sandbox-signature"], this.webhookSecret)) return null;
    try {
      const data = JSON.parse(rawBody) as { type: string; providerRef: string; at: string; reason?: string; dueAt?: string };
      switch (data.type) {
        case "payment.confirmed":
          return { type: "payment.confirmed", providerRef: data.providerRef, paidAt: new Date(data.at) };
        case "payment.expired":
          return { type: "payment.expired", providerRef: data.providerRef };
        case "payment.chargeback":
          return { type: "payment.chargeback", providerRef: data.providerRef, reason: data.reason ?? "Compra não reconhecida", dueAt: new Date(data.dueAt ?? Date.now() + 7 * 86_400_000) };
        case "payout.completed":
          return { type: "payout.completed", providerRef: data.providerRef };
        case "payout.failed":
          return { type: "payout.failed", providerRef: data.providerRef, reason: data.reason ?? "unknown" };
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
