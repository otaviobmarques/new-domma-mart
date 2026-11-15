import type { Cents } from "../money.ts";

/**
 * Camada de pagamento isolada (capítulo 10 e 14): o resto do sistema só conhece esta
 * interface. Trocar de fornecedor, ou usar dois ao mesmo tempo, é escrever outro adaptador.
 */
export interface Payer {
  name: string;
  email: string;
  document: string;
  phone?: string;
}

export interface PixCharge {
  providerRef: string;
  /** Código "copia e cola". */
  copyPaste: string;
  expiresAt: Date;
}

export type CardRefusalReason = "insufficient_funds" | "card_declined" | "invalid_card" | "suspected_fraud" | "processing_error";

export type CardChargeResult =
  | { status: "approved"; providerRef: string; cardLast4: string; cardBrand: string }
  | { status: "refused"; providerRef: string; reason: CardRefusalReason };

export type ProviderEvent =
  | { type: "payment.confirmed"; providerRef: string; paidAt: Date }
  | { type: "payment.expired"; providerRef: string }
  | { type: "payout.completed"; providerRef: string }
  | { type: "payout.failed"; providerRef: string; reason: string };

export interface PaymentProvider {
  readonly name: string;

  createPixCharge(input: { reference: string; amountCents: Cents; payer: Payer; description: string; expiresInSeconds: number }): Promise<PixCharge>;

  /** O número do cartão nunca passa pelo nosso servidor: recebemos só o token do campo do provedor. */
  createCardCharge(input: {
    reference: string;
    amountCents: Cents;
    installments: number;
    cardToken: string;
    payer: Payer;
    description: string;
  }): Promise<CardChargeResult>;

  refund(input: { providerRef: string; amountCents: Cents; reference: string }): Promise<{ refundRef: string }>;

  /** Saque via Pix para a chave do titular. */
  createPayout(input: { reference: string; amountCents: Cents; pixKey: string; document: string }): Promise<{ providerRef: string }>;

  /** Valida a assinatura e traduz a notificação do provedor. Retorna null se for inválida. */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ProviderEvent | null;
}

export const CARD_REFUSAL_MESSAGES: Record<CardRefusalReason, string> = {
  insufficient_funds: "O cartão não tem limite para esta compra. Tente outro cartão ou pague com Pix.",
  card_declined: "O banco não autorizou a compra. Tente outro cartão ou pague com Pix.",
  invalid_card: "Os dados do cartão não conferem. Revise o número, a validade e o código.",
  suspected_fraud: "Não conseguimos aprovar este cartão. Tente outro cartão ou pague com Pix.",
  processing_error: "Tivemos um problema ao falar com o banco. Tente de novo ou pague com Pix.",
};
