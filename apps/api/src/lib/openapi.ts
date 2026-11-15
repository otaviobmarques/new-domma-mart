import { API_SCOPES, WEBHOOK_EVENTS } from "@domma/core";
import { z } from "zod";
import type { Router } from "./router.ts";

/** Documentação gerada a partir das próprias rotas: nunca fica diferente do que a API faz. */
export function buildOpenApi(router: Router, apiUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const { method, path, def } of router.routes) {
    if (def.hidden) continue;
    const oaPath = path.replace(/:(\w+)/g, "{$1}");
    const params = [...path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const querySchema = def.query ? (z.toJSONSchema(def.query, { unrepresentable: "any" }) as { properties?: Record<string, unknown>; required?: string[] }) : null;
    for (const [name, schema] of Object.entries(querySchema?.properties ?? {})) {
      params.push({ name, in: "query", required: querySchema?.required?.includes(name) ?? false, schema } as never);
    }
    if (def.idempotent) {
      params.push({ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } } as never);
    }
    const security =
      def.access === "public" ? [] : def.access === "account" && def.scope ? [{ apiKey: [def.scope] }, { session: [] }] : [{ session: [] }];
    paths[oaPath] ??= {};
    paths[oaPath]![method] = {
      tags: [def.tag],
      summary: def.summary,
      parameters: params,
      security,
      ...(def.scope ? { "x-scope": def.scope } : {}),
      ...(def.body
        ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(def.body, { unrepresentable: "any" }) } } } }
        : {}),
      responses: {
        "200": { description: "Sucesso" },
        "400": { description: "Dados inválidos" },
        ...(def.access === "public" ? {} : { "401": { description: "Não autenticado" }, "403": { description: "Sem permissão" } }),
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Domma Mart API",
      version: "1.0.0",
      description:
        "API REST em JSON. Tudo o que o painel faz passa por esta mesma API.\n\n" +
        "**Autenticação:** `Authorization: Bearer dm_live_...` (chave de API, com escopos) — chaves `dm_test_...` usam o ambiente de testes, com pagamentos simulados.\n\n" +
        "**Idempotência:** requisições de criação aceitam `Idempotency-Key`; repetir a mesma chave devolve a mesma resposta, sem cobrar duas vezes.\n\n" +
        "**Webhooks:** assinados com HMAC-SHA256 no cabeçalho `Domma-Signature: t=<unix>,v1=<hex>` sobre `t.corpo`, com o segredo do endpoint. " +
        "Reenvio automático com intervalo crescente por até 72 horas.\n\n" +
        `**Eventos:** ${WEBHOOK_EVENTS.join(", ")}.`,
    },
    servers: [{ url: apiUrl }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: `Chave de API. Escopos: ${API_SCOPES.join(", ")}` },
        session: { type: "http", scheme: "bearer", description: "Sessão do painel (entrada sem senha)." },
      },
    },
    paths,
  };
}
