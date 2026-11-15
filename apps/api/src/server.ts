import { SandboxProvider } from "@domma/core/server";
import { createDb, ensureAppRole, migrate } from "@domma/db";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./env.ts";
import { type Deps, OrderBus } from "./lib/deps.ts";
import { startWorker } from "./worker.ts";

// Hospedagem com um único usuário de banco (ex.: Railway): a API cria o papel restrito e passa a usá-lo.
if (process.env.DATABASE_ADMIN_URL && process.env.APP_DB_PASSWORD) {
  process.env.DATABASE_URL = await ensureAppRole(process.env.DATABASE_ADMIN_URL, process.env.APP_DB_PASSWORD);
}
const config = loadConfig();

if (config.databaseAdminUrl && process.env.RUN_MIGRATIONS !== "false") {
  const ran = await migrate(config.databaseAdminUrl, (msg) => console.log(`[banco] ${msg}`));
  if (ran.length) console.log(`[banco] ${ran.length} migração(ões) aplicada(s)`);
}

const sql = createDb(config.databaseUrl);
const orderBus = new OrderBus();
const deps: Deps = { sql, config, provider: new SandboxProvider(config.sandboxWebhookSecret), now: () => new Date(), orderBus };

// Confirmação em tempo real: o banco avisa todas as instâncias quando um pedido muda de situação.
await sql
  .listen("order_status", (payload) => {
    const [orderId, status] = payload.split(":");
    if (orderId && status) orderBus.publish(orderId, status);
  })
  .catch((err) => console.warn("[api] sem LISTEN/NOTIFY (o checkout usa a conferência a cada 3 s):", err.message));

const { app } = createApp(deps);
const stopWorker = process.env.RUN_WORKER === "false" ? () => {} : startWorker(deps);
const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Domma Mart API em http://localhost:${info.port} (${config.env}, pagamentos: ${deps.provider.name})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    stopWorker();
    server.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
