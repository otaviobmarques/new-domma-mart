-- Arquivos enviados (documentos de verificação e vídeos das aulas). O conteúdo fica no armazenamento
-- privado; aqui fica só o registro, e ninguém recebe um endereço permanente.
create table files (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  uploaded_by uuid references users(id),
  purpose text not null check (purpose in ('kyc_document', 'kyc_selfie', 'lesson_video')),
  storage_key text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  created_at timestamptz not null default now()
);
create index files_account_idx on files (account_id, purpose, created_at desc);
alter table files enable row level security;
create policy tenant_isolation on files using (app.is_system() or account_id = app.account_id()) with check (app.is_system() or account_id = app.account_id());

-- Verificação de identidade: documento (frente e, se houver, verso) e selfie, analisados por uma pessoa.
create table kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  document_front_file_id uuid not null references files(id),
  document_back_file_id uuid references files(id),
  selfie_file_id uuid not null references files(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'returned')),
  note text,
  submitted_by uuid references users(id),
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index kyc_submissions_account_idx on kyc_submissions (account_id, created_at desc);
alter table kyc_submissions enable row level security;
create policy tenant_isolation on kyc_submissions using (app.is_system() or account_id = app.account_id()) with check (app.is_system() or account_id = app.account_id());

-- Vídeo da aula enviado para a plataforma (em vez de um endereço de fora).
alter table lessons add column video_file_id uuid references files(id);

-- Aceite dos termos: qual versão e quando.
alter table users add column terms_version text;
alter table users add column terms_accepted_at timestamptz;
