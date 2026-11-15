import type { PaymentMethod } from "./fees.ts";
import { type Bps, type Cents, percentOf } from "./money.ts";

/** Regra de liberação do dinheiro e reserva de segurança (item 12.4). */
export interface ReleasePolicy {
  tier: "new" | "growing" | "trusted" | "custom";
  pixReleaseDays: number;
  cardReleaseDays: number;
  boletoReleaseDays: number;
  reserveBps: Bps;
  reserveDays: number;
}

export interface AccountRiskStats {
  accountAgeDays: number;
  /** Reembolsos / vendas aprovadas, em pontos-base (500 = 5%). */
  refundRateBps: Bps;
  chargebackRateBps: Bps;
}

export interface ReleaseSettings {
  newAccountDays: number;
  trustedAccountDays: number;
  newAccountReleaseDays: number;
  pixReleaseDays: number;
  cardReleaseDays: number;
  reserveBps: Bps;
  reserveDays: number;
  trustedMaxRefundBps: Bps;
  trustedMaxChargebackBps: Bps;
}

export const DEFAULT_RELEASE_SETTINGS: ReleaseSettings = {
  newAccountDays: 30,
  trustedAccountDays: 90,
  newAccountReleaseDays: 7,
  pixReleaseDays: 1,
  cardReleaseDays: 15,
  reserveBps: 500,
  reserveDays: 30,
  trustedMaxRefundBps: 500,
  trustedMaxChargebackBps: 50,
};

export function resolveReleasePolicy(
  stats: AccountRiskStats,
  settings: ReleaseSettings = DEFAULT_RELEASE_SETTINGS,
  /** Condição própria da conta, definida pelo backoffice com dupla aprovação. */
  override?: Partial<Omit<ReleasePolicy, "tier">> | null,
): ReleasePolicy {
  let policy: ReleasePolicy;
  if (stats.accountAgeDays < settings.newAccountDays) {
    policy = {
      tier: "new",
      pixReleaseDays: settings.newAccountReleaseDays,
      cardReleaseDays: settings.newAccountReleaseDays,
      boletoReleaseDays: settings.newAccountReleaseDays,
      reserveBps: settings.reserveBps,
      reserveDays: settings.reserveDays,
    };
  } else {
    const trusted =
      stats.accountAgeDays >= settings.trustedAccountDays &&
      stats.refundRateBps < settings.trustedMaxRefundBps &&
      stats.chargebackRateBps < settings.trustedMaxChargebackBps;
    policy = {
      tier: trusted ? "trusted" : "growing",
      pixReleaseDays: settings.pixReleaseDays,
      cardReleaseDays: settings.cardReleaseDays,
      boletoReleaseDays: settings.pixReleaseDays,
      reserveBps: trusted ? 0 : settings.reserveBps,
      reserveDays: settings.reserveDays,
    };
  }
  if (override && Object.keys(override).length > 0) policy = { ...policy, ...override, tier: "custom" };
  return policy;
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do dia (horário de Brasília) N dias depois da data informada. */
export function releaseDate(from: Date, days: number): Date {
  const local = from.getTime() - BRT_OFFSET_MS;
  const startOfDay = Math.floor(local / DAY_MS) * DAY_MS;
  return new Date(startOfDay + days * DAY_MS + BRT_OFFSET_MS);
}

export interface ReleasePlan {
  /** Vai para "a liberar" e fica disponível em `releaseAt`. */
  pendingCents: Cents;
  releaseAt: Date;
  /** Vai para "reservado" e volta sozinho em `reserveReleaseAt`. */
  reserveCents: Cents;
  reserveReleaseAt: Date;
}

export function planRelease(net: Cents, method: PaymentMethod, paidAt: Date, policy: ReleasePolicy): ReleasePlan {
  const reserveCents = percentOf(net, policy.reserveBps);
  const days =
    method === "pix" ? policy.pixReleaseDays : method === "card" ? policy.cardReleaseDays : policy.boletoReleaseDays;
  return {
    pendingCents: net - reserveCents,
    releaseAt: releaseDate(paidAt, days),
    reserveCents,
    reserveReleaseAt: releaseDate(paidAt, Math.max(days, policy.reserveDays)),
  };
}
