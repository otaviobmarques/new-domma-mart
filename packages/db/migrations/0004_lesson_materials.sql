-- Editor da área de membros (P07): materiais de apoio de cada aula (título + endereço).
alter table lessons add column materials jsonb not null default '[]';
