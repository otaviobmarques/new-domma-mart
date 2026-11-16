import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Deps } from "./lib/deps.ts";
import { ApiError } from "./lib/errors.ts";
import { buildOpenApi } from "./lib/openapi.ts";
import { RateLimiter } from "./lib/rate-limit.ts";
import { Router } from "./lib/router.ts";
import { authRoutes } from "./routes/auth.ts";
import { backofficeRoutes } from "./routes/backoffice.ts";
import { buyerRoutes } from "./routes/buyer.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { checkoutRoutes } from "./routes/checkout.ts";
import { sellerRoutes } from "./routes/seller.ts";

export function createApp(deps: Deps) {
  const app = new Hono();
  const limiter = new RateLimiter();
  const router = new Router(app, deps);

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Cache-Control", "no-store");
  });
  app.use(
    "/v1/*",
    cors({
      origin: (origin) => (origin === deps.config.webUrl ? origin : null),
      allowHeaders: ["authorization", "content-type", "idempotency-key", "domma-account"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      maxAge: 600,
    }),
  );

  app.get("/health", async (c) => {
    await deps.sql`select 1`;
    return c.json({ ok: true, env: deps.config.env, provider: deps.provider.name });
  });

  authRoutes(router, deps, limiter);
  catalogRoutes(router, deps, limiter);
  checkoutRoutes(router, deps, limiter);
  sellerRoutes(router, deps);
  buyerRoutes(router, deps, limiter);
  backofficeRoutes(router, deps);

  const openapi = buildOpenApi(router, deps.config.apiUrl);
  app.get("/v1/openapi.json", (c) => c.json(openapi));
  app.get("/docs", (c) =>
    c.html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Domma Mart API</title></head>
<body><script id="api-reference" data-url="/v1/openapi.json"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script></body></html>`),
  );

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Rota não encontrada." } }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    // Violação de formato (uuid inválido etc.) vinda do banco.
    if ((err as { code?: string }).code === "22P02") return c.json({ error: { code: "not_found", message: "Registro não encontrado." } }, 404);
    console.error("[api] erro não tratado:", err);
    return c.json({ error: { code: "internal_error", message: "Tivemos um problema do nosso lado. Tente de novo em instantes." } }, 500);
  });

  return { app, limiter, router };
}
