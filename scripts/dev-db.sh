#!/usr/bin/env bash
# Sobe um PostgreSQL local para desenvolvimento e testes (porta 5433).
# Usa Docker se houver daemon; senão, os binários locais do PostgreSQL.
set -euo pipefail
PORT="${DOMMA_PG_PORT:-5433}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SQL_INIT="
do \$\$ begin
  if not exists (select from pg_roles where rolname='domma') then create role domma login password 'domma' createrole; end if;
  if not exists (select from pg_roles where rolname='domma_app') then create role domma_app login password 'domma_app'; end if;
end \$\$;"

if pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  echo "PostgreSQL já está no ar na porta $PORT"; exit 0
fi

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$PGBIN" ]; then
  DATA="${DOMMA_PG_DATA:-/var/tmp/domma-pgdata}"
  run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi; }
  if [ ! -d "$DATA" ]; then
    mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
    run "$PGBIN/initdb -D $DATA -U postgres --auth=trust >/dev/null"
  fi
  run "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -c listen_addresses=127.0.0.1' -l $DATA/server.log -w start"
  psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -c "$SQL_INIT"
  for db in domma domma_test; do
    psql -h 127.0.0.1 -p "$PORT" -U postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 \
      || psql -h 127.0.0.1 -p "$PORT" -U postgres -c "create database $db owner domma"
  done
else
  docker run -d --name domma-pg -p "$PORT":5432 -e POSTGRES_PASSWORD=postgres postgres:16
  until pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; do sleep 1; done
  PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U postgres -c "$SQL_INIT"
  for db in domma domma_test; do PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U postgres -c "create database $db owner domma"; done
fi
echo "PostgreSQL pronto na porta $PORT (bancos: domma, domma_test)"
