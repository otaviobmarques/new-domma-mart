import type { LedgerTxKind, Posting } from "@domma/core";
import type { Tx } from "@domma/db";

/** Grava um movimento no livro-razão. Precisa de contexto de sistema; o banco confere que fecha em zero. */
export async function postLedger(
  tx: Tx,
  input: { kind: LedgerTxKind; accountId?: string | null; orderId?: string | null; withdrawalId?: string | null; description: string; postings: Posting[] },
): Promise<string | null> {
  if (input.postings.length === 0) return null;
  const [txRow] = await tx`
    insert into ledger_transactions (kind, account_id, order_id, withdrawal_id, description)
    values (${input.kind}, ${input.accountId ?? null}, ${input.orderId ?? null}, ${input.withdrawalId ?? null}, ${input.description})
    returning id`;
  for (const p of input.postings) {
    await tx`insert into ledger_accounts (account_id, kind) values (${p.accountId}, ${p.kind}) on conflict (account_id, kind) do nothing`;
    const [la] = await tx`select id from ledger_accounts where account_id is not distinct from ${p.accountId} and kind = ${p.kind}`;
    await tx`
      insert into ledger_entries (transaction_id, ledger_account_id, account_id, kind, amount_cents)
      values (${txRow!.id}, ${la!.id}, ${p.accountId}, ${p.kind}, ${p.amountCents})`;
  }
  return txRow!.id;
}

export interface Wallet {
  available_cents: number;
  pending_cents: number;
  reserved_cents: number;
  /** Valor de vendas contestadas, separado até o resultado. */
  disputed_cents: number;
}

export async function getWallet(tx: Tx, accountId: string): Promise<Wallet> {
  const rows = await tx`select kind, balance_cents from ledger_accounts where account_id = ${accountId}`;
  const by = Object.fromEntries(rows.map((r) => [r.kind, r.balance_cents])) as Record<string, number>;
  return { available_cents: by.available ?? 0, pending_cents: by.pending ?? 0, reserved_cents: by.reserved ?? 0, disputed_cents: by.disputed ?? 0 };
}
