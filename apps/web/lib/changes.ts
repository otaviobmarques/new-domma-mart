import { formatBRL, formatBps } from "@domma/core";

type Obj = Record<string, any>;
const d = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Descreve em português o que uma alteração pedida muda. */
export function describeChange(payload: Obj): string[] {
  const out: string[] = [];
  const fees = (f: Obj | null | undefined, removed: string) => {
    if (f === null) return out.push(removed);
    if (!f) return;
    if (f.card?.percentBps != null) out.push(`Taxa do cartão: ${formatBps(f.card.percentBps)}`);
    if (f.card?.fixedCents != null) out.push(`Valor fixo do cartão: ${formatBRL(f.card.fixedCents)}`);
    if (f.pix?.fixedCents != null) out.push(`Valor fixo do Pix: ${formatBRL(f.pix.fixedCents)}`);
    if (f.pix?.percentBps != null) out.push(`Taxa do Pix: ${formatBps(f.pix.percentBps)}`);
    if (f.installmentInterestBpsMonthly != null) out.push(`Juros do parcelamento: ${formatBps(f.installmentInterestBpsMonthly)} ao mês`);
  };
  const release = (r: Obj | null | undefined, removed: string) => {
    if (r === null) return out.push(removed);
    if (!r) return;
    if (r.newAccountReleaseDays != null) out.push(`Liberação para conta nova: ${d(r.newAccountReleaseDays)}`);
    if (r.pixReleaseDays != null) out.push(`Liberação do Pix: ${d(r.pixReleaseDays)}`);
    if (r.cardReleaseDays != null) out.push(`Liberação do cartão: ${d(r.cardReleaseDays)}`);
    if (r.reserveBps != null) out.push(`Reserva de segurança: ${formatBps(r.reserveBps)}`);
    if (r.reserveDays != null) out.push(`Reserva devolvida em: ${d(r.reserveDays)}`);
  };
  fees(payload.fee_override, "Taxas: voltar para a tabela geral");
  release(payload.release_override, "Prazos e reserva: voltar para a regra geral");
  if ("withdrawal_daily_limit_cents" in payload)
    out.push(payload.withdrawal_daily_limit_cents == null ? "Limite de saque por dia: sem limite" : `Limite de saque por dia: ${formatBRL(payload.withdrawal_daily_limit_cents)}`);
  fees(payload.fees, "");
  release(payload.release, "");
  if (payload.pixExpiresMinutes != null) out.push(`Validade do Pix no checkout: ${payload.pixExpiresMinutes} minutos`);
  if (payload.pixKeyChangeBlockHours != null) out.push(`Bloqueio de saque após trocar a chave Pix: ${payload.pixKeyChangeBlockHours} horas`);
  return out;
}

export interface Change {
  id: string;
  kind: "account_conditions" | "platform_settings";
  account_id: string | null;
  account_name: string | null;
  payload: Obj;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  requested_by_name: string;
  decided_by_name: string | null;
  mine: boolean;
}
