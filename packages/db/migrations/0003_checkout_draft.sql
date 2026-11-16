-- Editor de checkout (P06): o produtor salva um rascunho e só o que ele publica vai ao ar.
alter table offers add column checkout_draft jsonb;
