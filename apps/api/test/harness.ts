import { SandboxProvider } from "@domma/core/server";
import { type Sql, createDb, migrate, withContext } from "@domma/db";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/env.ts";
import { type Deps, OrderBus } from "../src/lib/deps.ts";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://domma:domma@127.0.0.1:5433/domma_test";
const APP_URL = process.env.TEST_DATABASE_URL ?? "postgres://domma_app:domma_app@127.0.0.1:5433/domma_test";

export interface Harness {
  deps: Deps;
  sql: Sql;
  /** null = relógio de verdade. */
  clock: { now: Date | null };
  api: <T = any>(method: string, path: string, opts?: { body?: unknown; token?: string; headers?: Record<string, string> }) => Promise<{ status: number; body: T }>;
  system: <T>(fn: Parameters<typeof withContext<T>>[2]) => Promise<T>;
  close: () => Promise<void>;
  /** Cria produtor já logado. */
  producer: (email: string, name?: string) => Promise<{ token: string; accountId: string; userId: string }>;
  /** Produto aprovado com oferta; devolve o slug do checkout. */
  product: (token: string, overrides?: Record<string, unknown>) => Promise<{ id: string; slug: string; offerId: string }>;
  buyPix: (slug: string, buyer?: Partial<typeof BUYER>, extra?: Record<string, unknown>) => Promise<{ order_id: string; token: string }>;
  confirmCode: (token: string, purpose: "withdrawal" | "pix_key" | "api_key") => Promise<string>;
}

export const BUYER = { name: "Marina Souza", email: "marina@example.com", phone: "(11) 98765-4321", cpf: "529.982.247-25" };

export async function createHarness(): Promise<Harness> {
  await migrate(ADMIN_URL);
  const admin = createDb(ADMIN_URL, { max: 1 });
  // Banco limpo a cada arquivo de teste (o livro-razão só aceita inclusão, então o dono das tabelas é quem limpa).
  await admin.unsafe(`
    do $$ declare t text; begin
      for t in select tablename from pg_tables where schemaname = 'public' and tablename not in ('schema_migrations', 'platform_settings') loop
        execute format('truncate table %I restart identity cascade', t);
      end loop;
    end $$;
    insert into ledger_accounts (account_id, kind) values (null, 'provider_clearing'), (null, 'platform_revenue'), (null, 'payout_transit');`);
  await admin.end();

  const sql = createDb(APP_URL, { max: 5 });
  const clock: { now: Date | null } = { now: null };
  const config = loadConfig({ DOMMA_ENV: "test", DATABASE_URL: APP_URL, WEB_URL: "http://localhost:3000", BACKOFFICE_EMAILS: "equipe@domma.test" });
  const deps: Deps = { sql, config, provider: new SandboxProvider(config.sandboxWebhookSecret), now: () => clock.now ?? new Date(), orderBus: new OrderBus() };
  const { app } = createApp(deps);

  const api: Harness["api"] = async (method, path, opts = {}) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const h: Harness = {
    deps,
    sql,
    clock,
    api,
    system: (fn) => withContext(sql, { kind: "system" }, fn),
    close: () => sql.end(),
    async producer(email, name = "Rafael Oliveira") {
      const signup = await api("POST", "/v1/auth/signup", { body: { name, email, phone: "(11) 91234-5678", intent: "um curso de confeitaria" } });
      const verify = await api("POST", "/v1/auth/verify", { body: { identifier: email, code: signup.body.dev_code } });
      if (verify.status !== 200) throw new Error(`signup falhou: ${JSON.stringify(verify.body)}`);
      const me = await api("GET", "/v1/me", { token: verify.body.token });
      return { token: verify.body.token, accountId: me.body.current_account_id, userId: me.body.user.id };
    },
    async product(token, overrides = {}) {
      const created = await api("POST", "/v1/products", {
        token,
        body: {
          name: "Curso Exemplo: do zero à primeira venda",
          description: "Aprenda o passo a passo para escolher o que vender, montar sua oferta e colocar no ar.",
          offer: { price_cents: 19700 },
          modules: [{ title: "Escolhendo o que vender", lessons: [{ title: "Boas-vindas" }, { title: "O que é um produto digital" }] }],
          ...overrides,
        },
      });
      if (created.status !== 201) throw new Error(`produto falhou: ${JSON.stringify(created.body)}`);
      const published = await api("POST", `/v1/products/${created.body.id}/publish`, { token });
      if (published.body.status !== "approved") throw new Error(`produto não aprovado: ${JSON.stringify(published.body)}`);
      return { id: created.body.id, slug: created.body.offers[0].slug, offerId: created.body.offers[0].id };
    },
    async buyPix(slug, buyer = {}, extra = {}) {
      const order = await api("POST", `/v1/public/checkout/${slug}/orders`, { body: { buyer: { ...BUYER, ...buyer }, method: "pix", ...extra } });
      if (order.status !== 200) throw new Error(`pedido falhou: ${JSON.stringify(order.body)}`);
      const paid = await api("POST", `/v1/sandbox/orders/${order.body.order_id}/pay`, { body: { token: order.body.token } });
      if (paid.status !== 200) throw new Error(`pagamento falhou: ${JSON.stringify(paid.body)}`);
      return order.body;
    },
    async confirmCode(token, purpose) {
      const res = await api("POST", "/v1/auth/confirmation-code", { token, body: { purpose } });
      return res.body.dev_code;
    },
  };
  return h;
}
