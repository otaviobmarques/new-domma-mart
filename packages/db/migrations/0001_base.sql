-- Domma Mart — esquema base (Fase 1: Vender)
-- Regras gerais:
--  * dinheiro é sempre bigint em centavos;
--  * toda tabela de dados de produtor tem account_id e isolamento por linha (RLS);
--  * livro-razão e auditoria só aceitam inclusão.

create schema if not exists app;

-- Contexto da requisição. A API define estas variáveis no início de cada transação.
create or replace function app.account_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.account_id', true), '')::uuid $$;
create or replace function app.user_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
-- Contexto de sistema: checkout público, notificações do provedor, tarefas e backoffice.
create or replace function app.is_system() returns boolean language sql stable as
$$ select coalesce(current_setting('app.system', true), '') = 'on' $$;

create or replace function app.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

create or replace function app.forbid_change() returns trigger language plpgsql as
$$ begin raise exception 'A tabela % só aceita inclusão', tg_table_name using errcode = 'P0001'; end $$;

-- ───────────────────────── Pessoas e contas ─────────────────────────

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique check (email = lower(email)),
  phone text,
  cpf_enc text,
  cpf_hash text,
  phone_hash text,
  is_backoffice boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index users_cpf_hash_idx on users (cpf_hash);
create index users_phone_hash_idx on users (phone_hash);
create trigger users_touch before update on users for each row execute function app.touch_updated_at();

create table accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id),
  name text not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'closed')),
  block_reason text,
  withdrawals_blocked_reason text,
  -- Verificação de identidade (P02): só é exigida antes do primeiro saque.
  kyc_status text not null default 'none' check (kyc_status in ('none', 'in_review', 'approved', 'pending')),
  kyc_note text,
  document_enc text,
  document_hash text,
  pix_key_enc text,
  pix_key_changed_at timestamptz,
  -- Condições próprias (backoffice, com dupla aprovação). Null = segue o padrão da plataforma.
  fee_override jsonb,
  release_override jsonb,
  withdrawal_daily_limit_cents bigint,
  intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_owner_idx on accounts (owner_user_id);
create trigger accounts_touch before update on accounts for each row execute function app.touch_updated_at();

create table account_members (
  account_id uuid not null references accounts(id),
  user_id uuid not null references users(id),
  role text not null check (role in ('owner', 'admin', 'finance', 'support', 'traffic')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on account_members (user_id);

-- Códigos de 6 dígitos (entrada sem senha e segundo fator). Valem 10 minutos e um único uso.
create table login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  identifier_hash text not null,
  purpose text not null check (purpose in ('login', 'signup', 'withdrawal', 'pix_key', 'api_key')),
  code_hash text not null,
  payload jsonb,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_lookup_idx on login_codes (identifier_hash, purpose, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  user_agent text,
  -- Sessão aberta pelo botão "Acessar meu produto" para um e-mail que já existia:
  -- só enxerga aquele pedido, para ninguém ganhar a conta de outra pessoa comprando com o e-mail dela.
  restricted_order_id uuid,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

-- Links de acesso direto (e-mail, WhatsApp e botão "Acessar meu produto"). Uso único.
create table magic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  redirect_to text,
  restricted_order_id uuid,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null,
  env text not null default 'live' check (env in ('live', 'test')),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid references users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_account_idx on api_keys (account_id);

-- ───────────────────────── Catálogo ─────────────────────────

create table products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null,
  description text not null default '',
  type text not null default 'course' check (type in ('course', 'file', 'subscription', 'community', 'event', 'service')),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'paused', 'blocked')),
  guarantee_days int not null default 7 check (guarantee_days >= 7),
  delivery text not null default 'members_area' check (delivery in ('members_area', 'file', 'external_link', 'webhook')),
  delivery_url text,
  cover_url text,
  support_contact text,
  ai_generated boolean not null default false,
  -- Triagem (M07): resultado da primeira análise e decisão.
  review_triage text check (review_triage in ('approve', 'reject', 'doubt')),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_account_idx on products (account_id, created_at desc);
create index products_status_idx on products (status) where status = 'in_review';
create trigger products_touch before update on products for each row execute function app.touch_updated_at();

create table offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product_id uuid not null references products(id),
  name text not null default 'Oferta principal',
  slug text not null unique,
  price_cents bigint not null check (price_cents >= 100),
  max_installments int not null default 12 check (max_installments between 1 and 12),
  interest_payer text not null default 'buyer' check (interest_payer in ('buyer', 'producer')),
  methods text[] not null default '{pix,card}',
  is_default boolean not null default false,
  active boolean not null default true,
  checkout_config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offers_product_idx on offers (product_id);
create trigger offers_touch before update on offers for each row execute function app.touch_updated_at();

-- Order bump: oferta adicional marcada por caixa de seleção (até 3 por checkout).
create table order_bumps (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  offer_id uuid not null references offers(id),
  bump_offer_id uuid not null references offers(id),
  title text not null,
  description text not null default '',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (offer_id, bump_offer_id)
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product_id uuid references products(id),
  code text not null check (code = upper(code)),
  kind text not null check (kind in ('percent', 'fixed')),
  value bigint not null check (value > 0),
  expires_at timestamptz,
  max_uses int,
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (account_id, code)
);

-- Área de membros simples
create table modules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product_id uuid not null references products(id),
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index modules_product_idx on modules (product_id, position);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product_id uuid not null references products(id),
  module_id uuid not null references modules(id) on delete cascade,
  title text not null,
  description text not null default '',
  video_url text,
  duration_seconds int,
  position int not null default 0,
  release_after_days int not null default 0,
  release_at timestamptz,
  created_at timestamptz not null default now()
);
create index lessons_module_idx on lessons (module_id, position);

-- ───────────────────────── Vendas ─────────────────────────

-- Sessão de checkout: guarda o preenchimento a cada campo (recuperação de carrinho) e o funil.
create table checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  offer_id uuid not null references offers(id),
  stage text not null default 'visited' check (stage in ('visited', 'started', 'payment_generated', 'paid')),
  fields jsonb not null default '{}',
  utm jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkout_sessions_account_idx on checkout_sessions (account_id, created_at desc);
create trigger checkout_sessions_touch before update on checkout_sessions for each row execute function app.touch_updated_at();

create table orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 48000),
  account_id uuid not null references accounts(id),
  product_id uuid not null references products(id),
  offer_id uuid not null references offers(id),
  buyer_user_id uuid not null references users(id),
  checkout_session_id uuid references checkout_sessions(id),
  -- Token público: quem tem o token acompanha o pedido sem login (telas C02 e C03).
  public_token_hash text not null unique,
  env text not null default 'live' check (env in ('live', 'test')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refused', 'expired', 'refunded', 'chargeback')),
  method text not null check (method in ('pix', 'card', 'boleto')),
  installments int not null default 1,
  items_cents bigint not null,
  discount_cents bigint not null default 0,
  gross_cents bigint not null,
  buyer_total_cents bigint not null,
  interest_cents bigint not null default 0,
  fee_cents bigint not null,
  net_cents bigint not null,
  -- Taxa aplicada no momento da venda: o extrato nunca muda depois (12.3).
  fee_snapshot jsonb not null,
  release_snapshot jsonb,
  coupon_id uuid references coupons(id),
  origin text not null default 'direct',
  utm jsonb not null default '{}',
  refusal_reason text,
  card_last4 text,
  guarantee_until timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_account_idx on orders (account_id, created_at desc);
create index orders_buyer_idx on orders (buyer_user_id, created_at desc);
create index orders_account_status_idx on orders (account_id, status, paid_at desc);
create trigger orders_touch before update on orders for each row execute function app.touch_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  order_id uuid not null references orders(id),
  product_id uuid not null references products(id),
  offer_id uuid not null references offers(id),
  kind text not null default 'main' check (kind in ('main', 'bump', 'upsell')),
  title text not null,
  price_cents bigint not null
);
create index order_items_order_idx on order_items (order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  order_id uuid not null references orders(id),
  provider text not null,
  provider_ref text not null,
  method text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'refused', 'expired', 'refunded')),
  amount_cents bigint not null,
  pix_copy_paste text,
  expires_at timestamptz,
  refund_ref text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payments_order_idx on payments (order_id);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product_id uuid not null references products(id),
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index enrollments_unique_active on enrollments (product_id, user_id) where status = 'active';
create index enrollments_user_idx on enrollments (user_id);

create table lesson_progress (
  user_id uuid not null references users(id),
  lesson_id uuid not null references lessons(id) on delete cascade,
  account_id uuid not null references accounts(id),
  position_seconds int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  order_id uuid not null references orders(id) unique,
  buyer_user_id uuid not null references users(id),
  amount_cents bigint not null,
  reason text,
  -- within_guarantee = automático; producer_decision = fora da garantia, o produtor decide.
  kind text not null check (kind in ('within_guarantee', 'producer_decision', 'producer_initiated')),
  status text not null default 'requested' check (status in ('requested', 'approved', 'sent', 'completed', 'denied')),
  refund_ref text,
  requested_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger refunds_touch before update on refunds for each row execute function app.touch_updated_at();

-- Linha do tempo do reembolso (C07): cada etapa com data, hora e uma frase.
create table refund_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  account_id uuid not null references accounts(id),
  refund_id uuid not null references refunds(id),
  step text not null check (step in ('requested', 'approved', 'sent', 'available', 'denied')),
  message text not null,
  created_at timestamptz not null default now()
);
create index refund_events_refund_idx on refund_events (refund_id, seq);

-- ───────────────────────── Financeiro: livro-razão ─────────────────────────

create table ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  -- null = conta da plataforma
  account_id uuid references accounts(id),
  kind text not null check (kind in ('pending', 'available', 'reserved', 'provider_clearing', 'platform_revenue', 'payout_transit')),
  balance_cents bigint not null default 0,
  unique nulls not distinct (account_id, kind)
);

create table ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sale', 'release', 'refund', 'withdrawal', 'withdrawal_settled', 'withdrawal_failed', 'adjustment')),
  account_id uuid references accounts(id),
  order_id uuid references orders(id),
  withdrawal_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);
create index ledger_tx_account_idx on ledger_transactions (account_id, created_at desc);
create index ledger_tx_order_idx on ledger_transactions (order_id);

create table ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references ledger_transactions(id),
  ledger_account_id uuid not null references ledger_accounts(id),
  account_id uuid references accounts(id),
  kind text not null,
  amount_cents bigint not null check (amount_cents <> 0),
  created_at timestamptz not null default now()
);
create index ledger_entries_tx_idx on ledger_entries (transaction_id);
create index ledger_entries_account_idx on ledger_entries (account_id, created_at desc);

create trigger ledger_transactions_append_only before update or delete on ledger_transactions
  for each row execute function app.forbid_change();
create trigger ledger_entries_append_only before update or delete on ledger_entries
  for each row execute function app.forbid_change();

-- Saldo de cada conta do razão é mantido junto com o lançamento.
create or replace function app.ledger_apply_entry() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update ledger_accounts set balance_cents = balance_cents + new.amount_cents where id = new.ledger_account_id;
  return new;
end $$;
create trigger ledger_entries_apply after insert on ledger_entries
  for each row execute function app.ledger_apply_entry();

-- Dupla entrada: no fim da transação do banco, os lançamentos de cada movimento têm que somar zero.
create or replace function app.ledger_check_balanced() returns trigger language plpgsql security definer set search_path = public as $$
declare total bigint;
begin
  select coalesce(sum(amount_cents), 0) into total from ledger_entries where transaction_id = new.transaction_id;
  if total <> 0 then
    raise exception 'Movimento % não fecha: diferença de % centavos', new.transaction_id, total using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced after insert on ledger_entries
  deferrable initially deferred for each row execute function app.ledger_check_balanced();

-- Liberações agendadas: "a liberar" e "reservado" viram "disponível" na data, sem pedido do produtor.
create table scheduled_releases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  order_id uuid not null references orders(id),
  from_kind text not null check (from_kind in ('pending', 'reserved')),
  amount_cents bigint not null check (amount_cents > 0),
  release_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'released', 'canceled')),
  ledger_transaction_id uuid references ledger_transactions(id),
  created_at timestamptz not null default now()
);
create index scheduled_releases_due_idx on scheduled_releases (release_at) where status = 'scheduled';
create index scheduled_releases_account_idx on scheduled_releases (account_id, status, release_at);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  pix_key_masked text not null,
  provider text not null,
  provider_ref text,
  failure_reason text,
  requested_by uuid references users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index withdrawals_account_idx on withdrawals (account_id, created_at desc);
create unique index withdrawals_provider_ref_idx on withdrawals (provider, provider_ref);
alter table ledger_transactions add constraint ledger_tx_withdrawal_fk foreign key (withdrawal_id) references withdrawals(id);

-- ───────────────────────── Plataforma aberta ─────────────────────────

create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index webhook_endpoints_account_idx on webhook_endpoints (account_id);

create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  last_status_code int,
  last_error text,
  next_attempt_at timestamptz default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_endpoint_idx on webhook_deliveries (endpoint_id, created_at desc);

-- Chave de idempotência: a mesma requisição repetida devolve a mesma resposta, sem cobrar duas vezes.
create table idempotency_keys (
  scope text not null,
  key text not null,
  request_hash text not null,
  status_code int,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

-- ───────────────────────── Risco, auditoria e configuração ─────────────────────────

create table audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references users(id),
  actor_kind text not null check (actor_kind in ('user', 'api_key', 'backoffice', 'system', 'ai')),
  account_id uuid references accounts(id),
  action text not null,
  target text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_account_idx on audit_log (account_id, created_at desc);
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function app.forbid_change();

-- Configurações da plataforma com histórico de versões (B05). Vale a de maior versão publicada.
create table platform_settings (
  version int primary key generated always as identity,
  data jsonb not null,
  published_by uuid references users(id),
  approved_by uuid references users(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- "Este link é verdadeiro?" (C08): links denunciados entram na fila do backoffice.
create table link_reports (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  reporter_contact text,
  status text not null default 'open' check (status in ('open', 'takedown_requested', 'dismissed')),
  created_at timestamptz not null default now()
);

create table product_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product_id uuid not null references products(id),
  reporter_user_id uuid references users(id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

-- Mensagens enviadas (e-mail / WhatsApp), para auditoria e para o ambiente de desenvolvimento.
create table outbox_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  template text not null,
  data jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_due_idx on outbox_messages (created_at) where status = 'pending';

-- ───────────────────────── Isolamento por conta (RLS) ─────────────────────────
-- Uma conta nunca lê dados de outra, mesmo que haja erro na aplicação: a regra está no banco.

do $$
declare t text;
begin
  -- Tabelas de produtor: acesso só à própria conta.
  foreach t in array array[
    'api_keys', 'products', 'offers', 'order_bumps', 'coupons', 'modules', 'lessons',
    'checkout_sessions', 'order_items', 'payments', 'refund_events', 'scheduled_releases',
    'withdrawals', 'webhook_endpoints', 'webhook_deliveries', 'product_reports'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (app.is_system() or account_id = app.account_id()) with check (app.is_system() or account_id = app.account_id())', t);
  end loop;

  -- Tabelas em que o comprador também enxerga o que é dele.
  foreach t in array array['orders', 'refunds'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_or_buyer on %I using (app.is_system() or account_id = app.account_id() or buyer_user_id = app.user_id()) with check (app.is_system() or account_id = app.account_id())', t);
  end loop;
  foreach t in array array['enrollments', 'lesson_progress'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_or_user on %I using (app.is_system() or account_id = app.account_id() or user_id = app.user_id()) with check (app.is_system() or account_id = app.account_id() or user_id = app.user_id())', t);
  end loop;

  -- Livro-razão: o produtor lê só os próprios lançamentos; escrever é só em contexto de sistema.
  foreach t in array array['ledger_accounts', 'ledger_transactions', 'ledger_entries'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy ledger_read on %I for select using (app.is_system() or account_id = app.account_id())', t);
    execute format('create policy ledger_write on %I for insert with check (app.is_system())', t);
  end loop;
  create policy ledger_accounts_lock on ledger_accounts for update using (app.is_system()) with check (app.is_system());

  -- Tabelas só de sistema.
  foreach t in array array[
    'login_codes', 'sessions', 'magic_links', 'idempotency_keys',
    'platform_settings', 'link_reports', 'outbox_messages'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy system_only on %I using (app.is_system()) with check (app.is_system())', t);
  end loop;
end $$;

-- Auditoria: a conta registra as próprias ações, mas só o sistema (backoffice) lê.
alter table audit_log enable row level security;
create policy audit_read on audit_log for select using (app.is_system());
create policy audit_write on audit_log for insert with check (app.is_system() or account_id = app.account_id());

alter table accounts enable row level security;
create policy accounts_own on accounts using (app.is_system() or id = app.account_id()) with check (app.is_system() or id = app.account_id());
alter table account_members enable row level security;
create policy members_own on account_members using (app.is_system() or account_id = app.account_id() or user_id = app.user_id()) with check (app.is_system() or account_id = app.account_id());
alter table users enable row level security;
-- Cada pessoa vê o próprio cadastro; o produtor vê apenas quem comprou dele.
create policy users_self on users using (
  app.is_system() or id = app.user_id()
  or exists (select 1 from orders o where o.buyer_user_id = users.id and o.account_id = app.account_id())
) with check (app.is_system() or id = app.user_id());

-- ───────────────────────── Permissões do papel da aplicação ─────────────────────────

do $$
begin
  if exists (select from pg_roles where rolname = 'domma_app') then
    grant usage on schema public, app to domma_app;
    grant select, insert, update, delete on all tables in schema public to domma_app;
    grant usage, select on all sequences in schema public to domma_app;
    grant execute on all functions in schema app to domma_app;
    -- Somente inclusão, também nas permissões (além dos gatilhos).
    revoke update, delete, truncate on ledger_transactions, ledger_entries, audit_log from domma_app;
    alter default privileges in schema public grant select, insert, update, delete on tables to domma_app;
    alter default privileges in schema public grant usage, select on sequences to domma_app;
  end if;
end $$;

-- Contas da plataforma no razão e configuração inicial (proposta do item 12.2 — a validar).
insert into ledger_accounts (account_id, kind) values (null, 'provider_clearing'), (null, 'platform_revenue'), (null, 'payout_transit');

insert into platform_settings (data, published_at) values ('{
  "fees": {
    "pix": {"percentBps": 0, "fixedCents": 149},
    "card": {"percentBps": 399, "fixedCents": 149},
    "boleto": {"percentBps": 399, "fixedCents": 149},
    "installmentInterestBpsMonthly": 299,
    "maxInstallments": 12
  },
  "release": {
    "newAccountDays": 30, "trustedAccountDays": 90, "newAccountReleaseDays": 7,
    "pixReleaseDays": 1, "cardReleaseDays": 15, "reserveBps": 500, "reserveDays": 30,
    "trustedMaxRefundBps": 500, "trustedMaxChargebackBps": 50
  },
  "pixKeyChangeBlockHours": 24,
  "pixExpiresMinutes": 15,
  "prohibitedCategories": [
    "Ganho garantido e pirâmide", "Apostas e sinais", "Conteúdo adulto", "Saúde sem profissional",
    "Armas, drogas e documentos falsos", "Pirataria", "Dados pessoais e contas"
  ]
}'::jsonb, now());
