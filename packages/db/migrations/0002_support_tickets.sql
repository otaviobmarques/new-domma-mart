-- Atendimento humano (M10): o que a pessoa envia tem prazo de resposta visível — até 1 dia útil.
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1000),
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  topic text not null check (topic in ('access', 'payment', 'refund', 'other')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'answered')),
  answer text,
  answered_by uuid references users(id),
  answered_at timestamptz,
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index support_tickets_user_idx on support_tickets (user_id, created_at desc);
create index support_tickets_open_idx on support_tickets (due_at) where status = 'open';

alter table support_tickets enable row level security;
create policy tickets_owner on support_tickets using (app.is_system() or user_id = app.user_id()) with check (app.is_system() or user_id = app.user_id());
