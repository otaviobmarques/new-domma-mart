-- Afiliados e coprodução (M05): programa por produto, vínculo do afiliado, coprodutores e a divisão de cada venda.

alter table products add column affiliate_mode text not null default 'closed' check (affiliate_mode in ('closed', 'open', 'approval'));
alter table products add column affiliate_commission_type text not null default 'percent' check (affiliate_commission_type in ('percent', 'fixed'));
alter table products add column affiliate_commission_bps int not null default 3000 check (affiliate_commission_bps between 0 and 9000);
alter table products add column affiliate_commission_cents bigint not null default 0 check (affiliate_commission_cents >= 0);
-- Quem leva a comissão quando o comprador passou por mais de um link: o primeiro ou o último.
alter table products add column affiliate_attribution text not null default 'last' check (affiliate_attribution in ('first', 'last'));
alter table products add column affiliate_cookie_days int not null default 30 check (affiliate_cookie_days between 1 and 365);
alter table products add column affiliate_materials jsonb not null default '[]';

create table affiliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),            -- produtor
  product_id uuid not null references products(id),
  affiliate_account_id uuid not null references accounts(id),  -- quem divulga
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'blocked')),
  code text not null unique,
  -- Comissão própria deste afiliado; vazia = a do programa.
  commission_type text check (commission_type in ('percent', 'fixed')),
  commission_bps int check (commission_bps between 0 and 9000),
  commission_cents bigint check (commission_cents >= 0),
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (product_id, affiliate_account_id),
  check (affiliate_account_id <> account_id)
);
create index affiliations_affiliate_idx on affiliations (affiliate_account_id, created_at desc);
create index affiliations_product_idx on affiliations (product_id, status);
alter table affiliations enable row level security;
create policy affiliation_parties on affiliations
  using (app.is_system() or account_id = app.account_id() or affiliate_account_id = app.account_id())
  with check (app.is_system() or account_id = app.account_id() or affiliate_account_id = app.account_id());

create table coproductions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),             -- produtor
  product_id uuid not null references products(id),
  coproducer_account_id uuid not null references accounts(id),
  percent_bps int not null check (percent_bps between 1 and 9000),
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'ended')),
  ends_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (coproducer_account_id <> account_id)
);
create unique index coproductions_active_idx on coproductions (product_id, coproducer_account_id) where status in ('invited', 'accepted');
create index coproductions_coproducer_idx on coproductions (coproducer_account_id, created_at desc);
alter table coproductions enable row level security;
create policy coproduction_parties on coproductions
  using (app.is_system() or account_id = app.account_id() or coproducer_account_id = app.account_id())
  with check (app.is_system() or account_id = app.account_id() or coproducer_account_id = app.account_id());

-- A parte de cada um em uma venda, fixada no momento do pedido: mudar a comissão depois não altera vendas feitas.
create table order_splits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  account_id uuid not null references accounts(id),           -- quem recebe
  producer_account_id uuid not null references accounts(id),
  role text not null check (role in ('affiliate', 'coproducer')),
  amount_cents bigint not null check (amount_cents >= 0),
  affiliation_id uuid references affiliations(id),
  coproduction_id uuid references coproductions(id),
  created_at timestamptz not null default now()
);
create index order_splits_order_idx on order_splits (order_id);
create index order_splits_account_idx on order_splits (account_id, created_at desc);
alter table order_splits enable row level security;
create policy split_parties on order_splits
  using (app.is_system() or account_id = app.account_id() or producer_account_id = app.account_id())
  with check (app.is_system());

alter table orders add column affiliation_id uuid references affiliations(id);
-- Soma do que vai para afiliado e coprodutores. O líquido do produtor é net_cents menos isto.
alter table orders add column commissions_cents bigint not null default 0;
