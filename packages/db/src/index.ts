import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function createDb(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 10,
    onnotice: () => {},
    types: {
      // bigint (centavos) como number: valores cabem com folga em inteiros seguros.
      bigint: { to: 20, from: [20], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
      // sum(bigint) volta como numeric.
      numeric: { to: 1700, from: [1700], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
    },
  });
}

export type DbContext =
  | { kind: "system"; userId?: string }
  | { kind: "account"; accountId: string; userId?: string }
  | { kind: "user"; userId: string };

/**
 * Abre uma transação com o contexto de isolamento definido. Toda consulta da API
 * passa por aqui: sem contexto, as regras de RLS não devolvem nenhuma linha.
 */
export async function withContext<T>(sql: Sql, ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    const accountId = ctx.kind === "account" ? ctx.accountId : "";
    const userId = ctx.userId ?? "";
    const system = ctx.kind === "system" ? "on" : "off";
    await tx`select set_config('app.account_id', ${accountId}, true), set_config('app.user_id', ${userId}, true), set_config('app.system', ${system}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export { migrate } from "./migrate.ts";
