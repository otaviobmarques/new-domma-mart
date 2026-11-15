import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const HERE = dirname(fileURLToPath(import.meta.url));
// No código-fonte as migrações ficam em ../migrations; no build da API, ao lado do arquivo final.
const MIGRATIONS_DIR = [join(HERE, "migrations"), join(HERE, "..", "migrations")].find((dir) => existsSync(dir)) ?? join(HERE, "..", "migrations");

/** Aplica, em ordem, as migrações ainda não registradas. Cada arquivo roda em uma transação. */
export async function migrate(adminUrl: string, log: (msg: string) => void = () => {}): Promise<string[]> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`aplicada: ${file}`);
      ran.push(file);
    }
    return ran;
  } finally {
    await sql.end();
  }
}

/**
 * Garante o papel da aplicação (sem privilégios de dono, sujeito ao isolamento por conta)
 * e devolve a conexão que a API deve usar. Roda antes das migrações, que dão as permissões a ele.
 */
export async function ensureAppRole(adminUrl: string, password: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(password)) throw new Error("APP_DB_PASSWORD precisa ter 16+ caracteres (letras, números, - e _)");
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const [role] = await sql`select 1 from pg_roles where rolname = 'domma_app'`;
    await sql.unsafe(`${role ? "alter" : "create"} role domma_app login password '${password}'`);
  } finally {
    await sql.end();
  }
  const url = new URL(adminUrl);
  url.username = "domma_app";
  url.password = password;
  return url.toString();
}
