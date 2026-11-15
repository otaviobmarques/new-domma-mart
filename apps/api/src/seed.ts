/**
 * Dados de exemplo para desenvolvimento: um produtor, um curso aprovado com order bump
 * e algumas vendas. Tudo passa pela própria API, como faria um cliente de verdade.
 */
import { SandboxProvider } from "@domma/core/server";
import { createDb, withContext } from "@domma/db";
import { createApp } from "./app.ts";
import { loadConfig } from "./env.ts";
import { type Deps, OrderBus } from "./lib/deps.ts";

const config = loadConfig();
if (config.env === "production") throw new Error("O seed não roda em produção.");
const sql = createDb(config.databaseUrl, { max: 2 });
const deps: Deps = { sql, config, provider: new SandboxProvider(config.sandboxWebhookSecret), now: () => new Date(), orderBus: new OrderBus() };
const { app } = createApp(deps);

let ip = 1;
async function call<T = any>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${ip++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(data)}`);
  return data as T;
}

const EMAIL = "rafael@exemplo.com";
const [existing] = await withContext(sql, { kind: "system" }, (tx) => tx`select 1 from users where email = ${EMAIL}`);
if (existing) {
  console.log(`Dados de exemplo já existem. Entre com ${EMAIL} em ${config.webUrl}/entrar`);
} else {
  const signup = await call("POST", "/v1/auth/signup", { name: "Rafael Oliveira", email: EMAIL, phone: "(11) 91234-5678", intent: "um curso para quem quer fazer a primeira venda na internet" });
  const { token } = await call("POST", "/v1/auth/verify", { identifier: EMAIL, code: signup.dev_code });

  const course = await call(
    "POST",
    "/v1/products",
    {
      name: "Curso Exemplo: do zero à primeira venda",
      description: "Aprenda o passo a passo para escolher o que vender, montar sua oferta e colocar no ar.",
      offer: { price_cents: 19700 },
      modules: [
        { title: "Escolhendo o que vender", lessons: ["Boas-vindas", "O que é um produto digital", "Encontrando seu público", "Como escolher o que vender", "Validando a ideia", "Resumo do módulo"].map((title) => ({ title })) },
        { title: "Montando sua oferta", lessons: ["Preço e garantia", "A página de vendas", "Bônus que fazem sentido"].map((title) => ({ title })) },
        { title: "Colocando no ar", lessons: ["Seu checkout", "Divulgando o link"].map((title) => ({ title })) },
      ],
    },
    token,
  );
  await call("POST", `/v1/products/${course.id}/publish`, undefined, token);
  await call("PATCH", `/v1/products/${course.id}`, { support_contact: "suporte@exemplo.com" }, token);

  const sheet = await call("POST", "/v1/products", { name: "Planilha de planejamento", description: "Planilha para organizar as ideias e as metas do seu primeiro produto.", type: "file", offer: { price_cents: 2700 } }, token);
  await call("POST", `/v1/products/${sheet.id}/publish`, undefined, token);
  await call("POST", `/v1/offers/${course.offers[0].id}/bumps`, { bump_offer_id: sheet.offers[0].id, title: "Leve também: Planilha de planejamento" }, token);
  await call("POST", "/v1/coupons", { code: "BEMVINDO", kind: "percent", value: 10 }, token);

  const slug = course.offers[0].slug;
  const buyers = [
    { name: "Marina Souza", email: "marina@exemplo.com", phone: "(11) 98765-4321", cpf: "529.982.247-25", method: "pix" },
    { name: "Carlos Andrade", email: "carlos@exemplo.com", phone: "(21) 99876-5432", cpf: "111.444.777-35", method: "card", card_token: "tok_test_approved", installments: 3 },
    { name: "Diego Martins", email: "diego@exemplo.com", phone: "(31) 98888-7777", cpf: "390.533.447-05", method: "card", card_token: "tok_test_insufficient_funds" },
    { name: "Juliana Prado", email: "juliana@exemplo.com", phone: "(41) 97777-6666", cpf: "168.995.350-09", method: "pix", pending: true },
  ];
  for (const { pending, method, card_token, installments, ...buyer } of buyers) {
    const { session_id } = await call("POST", `/v1/public/checkout/${slug}/sessions`, {});
    const order = await call("POST", `/v1/public/checkout/${slug}/orders`, { session_id, buyer, method, card_token, installments });
    if (method === "pix" && !pending) await call("POST", `/v1/sandbox/orders/${order.order_id}/pay`, { token: order.token });
  }
  for (let i = 0; i < 5; i++) await call("POST", `/v1/public/checkout/${slug}/sessions`, {});

  console.log(`\nPronto. Dados de exemplo criados:
  Produtor:  ${EMAIL} (entre em ${config.webUrl}/entrar — o código aparece na tela em desenvolvimento)
  Comprador: marina@exemplo.com
  Checkout:  ${config.webUrl}/c/${slug}
  Cupom:     BEMVINDO (10%)\n`);
}
await sql.end();
