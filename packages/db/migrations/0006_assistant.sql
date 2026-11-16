-- Atendimento ao comprador com IA: a conversa fica guardada para a pessoa retomar e para auditoria.
create table assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index assistant_conversations_user_idx on assistant_conversations (user_id, created_at desc);

create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  user_id uuid not null references users(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Botões e avisos que acompanham a resposta (link, pedido aberto, acesso reenviado).
  cards jsonb not null default '[]',
  -- Quem respondeu: 'model' (IA) ou 'local' (respostas prontas, sem IA).
  source text check (source in ('model', 'local')),
  created_at timestamptz not null default now()
);
create index assistant_messages_conversation_idx on assistant_messages (conversation_id, seq);

alter table assistant_conversations enable row level security;
create policy conversation_owner on assistant_conversations using (app.is_system() or user_id = app.user_id()) with check (app.is_system() or user_id = app.user_id());
alter table assistant_messages enable row level security;
create policy message_owner on assistant_messages using (app.is_system() or user_id = app.user_id()) with check (app.is_system() or user_id = app.user_id());

-- De onde veio o pedido de atendimento humano: do formulário ou encaminhado pela assistente.
alter table support_tickets add column source text not null default 'form' check (source in ('form', 'assistant'));
