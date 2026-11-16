-- E-mails de verdade: novas tentativas com intervalo, identificação no provedor e lista de endereços que não recebem.
alter table outbox_messages add column next_attempt_at timestamptz not null default now();
alter table outbox_messages add column provider_id text;
alter table outbox_messages drop constraint outbox_messages_status_check;
alter table outbox_messages add constraint outbox_messages_status_check check (status in ('pending', 'sent', 'failed', 'suppressed'));
drop index outbox_due_idx;
create index outbox_due_idx on outbox_messages (next_attempt_at) where status = 'pending';
create index outbox_provider_idx on outbox_messages (provider_id) where provider_id is not null;
create index outbox_recent_idx on outbox_messages (created_at desc);

-- Endereços que devolveram a mensagem de forma definitiva ou marcaram como spam: não insistimos.
create table email_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounced', 'complained')),
  detail text,
  created_at timestamptz not null default now()
);
alter table email_suppressions enable row level security;
create policy system_only on email_suppressions using (app.is_system()) with check (app.is_system());
