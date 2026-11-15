import { migrate } from "./migrate.ts";

const url = process.env.DATABASE_ADMIN_URL ?? "postgres://domma:domma@127.0.0.1:5433/domma";
const ran = await migrate(url, console.log);
console.log(ran.length ? `${ran.length} migração(ões) aplicada(s)` : "Banco já está atualizado");
