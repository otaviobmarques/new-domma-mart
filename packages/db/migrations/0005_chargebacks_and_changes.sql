-- Risco e chargebacks (B04) e alterações com dupla aprovação (B03 e B05).

-- Carteira "em contestação": o valor de uma venda contestada fica separado até o resultado.
alter table ledger_accounts drop constraint ledger_accounts_kind_check;
alter table ledger_accounts add constraint ledger_accounts_kind_check
  check (kind in ('pending', 'available', 'reserved', 'disputed', 'provider_clearing', 'platform_revenue', 'payout_transit'));
alter table ledger_transactions drop constraint ledger_transactions_kind_check;
alter table ledger_transactions add constraint ledger_transactions_kind_check
  check (kind in ('sale', 'release', 'refund', 'withdrawal', 'withdrawal_settled', 'withdrawal_failed', 'adjustment', 'chargeback', 'chargeback_won', 'chargeback_lost'));

create table chargebacks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  order_id uuid not null references orders(id) unique,
  amount_cents bigint not null,
  reason text not null,
  -- open: aguardando provas · defended: defesa enviada à adquirente · won / lost: resultado registrado
  status text not null default 'open' check (status in ('open', 'defended', 'won', 'lost')),
  due_at timestamptz not null,
  evidence text,
  evidence_at timestamptz,
  defense_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index chargebacks_open_idx on chargebacks (due_at) where status in ('open', 'defended');
alter table chargebacks enable row level security;
create policy tenant_isolation on chargebacks using (app.is_system() or account_id = app.account_id()) with check (app.is_system() or account_id = app.account_id());

-- Alterações financeiras e de configuração exigem dois operadores: um pede, outro aprova.
create table pending_changes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('account_conditions', 'platform_settings')),
  account_id uuid references accounts(id),
  payload jsonb not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references users(id),
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- Quem pede não pode ser quem aprova.
  check (decided_by is null or decided_by <> requested_by or status = 'rejected')
);
create index pending_changes_open_idx on pending_changes (created_at) where status = 'pending';
alter table pending_changes enable row level security;
create policy system_only on pending_changes using (app.is_system()) with check (app.is_system());
