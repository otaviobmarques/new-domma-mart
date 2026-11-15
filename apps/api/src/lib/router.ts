import { createHash } from "node:crypto";
import type { ApiScope } from "@domma/core";
import { hashToken } from "@domma/core/server";
import { type DbContext, type Tx, withContext } from "@domma/db";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Deps } from "./deps.ts";
import { ApiError, badRequest, conflict, forbidden, unauthorized, unprocessable } from "./errors.ts";

export type Role = "owner" | "admin" | "finance" | "support" | "traffic";

export interface SessionAuth {
  kind: "session";
  sessionId: string;
  user: { id: string; name: string; email: string; isBackoffice: boolean };
  /** Sessão limitada a um pedido (ver migração: sessions.restricted_order_id). */
  restrictedOrderId: string | null;
  account: { id: string; role: Role } | null;
}
export interface KeyAuth {
  kind: "api_key";
  keyId: string;
  account: { id: string; role: "api" };
  scopes: string[];
  env: "live" | "test";
}
export type Auth = SessionAuth | KeyAuth;

/**
 * public: sem login · user: qualquer pessoa logada (comprador) ·
 * account: produtor (sessão com conta ou chave de API) · backoffice: equipe Domma.
 */
type Access = "public" | "user" | "account" | "backoffice";

export interface RouteDef<B extends z.ZodType, Q extends z.ZodType> {
  access: Access;
  tag: string;
  summary: string;
  body?: B;
  query?: Q;
  /** Escopo exigido quando a chamada vem por chave de API. Sem escopo = rota só do painel. */
  scope?: ApiScope;
  /** Funções da equipe do produtor que podem usar a rota (padrão: todas). */
  roles?: Role[];
  /** Aceita o cabeçalho Idempotency-Key. */
  idempotent?: boolean;
  hidden?: boolean;
}

export interface RouteArgs<B, Q> {
  c: Context;
  body: B;
  query: Q;
  params: Record<string, string>;
  auth: Auth | null;
  /** Id da conta do produtor (rotas "account"). */
  accountId: string;
  /** Id da pessoa logada (rotas "user" e sessões de produtor). */
  userId: string | null;
  /** Transação com o isolamento da conta/pessoa da requisição. */
  db: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  /** Transação em contexto de sistema — só para operações que cruzam contas (dinheiro, checkout). */
  system: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  ip: string;
}

type Handler<B, Q> = (args: RouteArgs<B, Q>) => Promise<unknown>;

interface Registered {
  method: string;
  path: string;
  def: RouteDef<z.ZodType, z.ZodType>;
}

const ROLES_ALL: Role[] = ["owner", "admin", "finance", "support", "traffic"];

export class Router {
  readonly routes: Registered[] = [];
  constructor(
    private readonly app: Hono,
    private readonly deps: Deps,
  ) {}

  get = this.method("get");
  post = this.method("post");
  patch = this.method("patch");
  put = this.method("put");
  delete = this.method("delete");

  private method(method: "get" | "post" | "patch" | "put" | "delete") {
    return <B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined>(
      path: string,
      def: RouteDef<B, Q>,
      handler: Handler<z.infer<B>, z.infer<Q>>,
    ) => {
      this.routes.push({ method, path, def: def as RouteDef<z.ZodType, z.ZodType> });
      this.app.on(method.toUpperCase(), path, (c) => this.run(c, def, handler as Handler<unknown, unknown>));
    };
  }

  private async run(c: Context, def: RouteDef<z.ZodType, z.ZodType>, handler: Handler<unknown, unknown>) {
    const { sql } = this.deps;
    const auth = await this.authenticate(c);
    this.authorize(def, auth);

    let body: unknown;
    let rawBody = "";
    if (def.body) {
      rawBody = await c.req.text();
      let json: unknown;
      try {
        json = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw badRequest("invalid_json", "O corpo da requisição não é um JSON válido.");
      }
      body = parse(def.body, json);
    }
    const query = def.query ? parse(def.query, c.req.query()) : undefined;

    const accountId = auth?.account?.id ?? "";
    const userId = auth?.kind === "session" ? auth.user.id : null;
    const ctx: DbContext =
      def.access === "account"
        ? { kind: "account", accountId, userId: userId ?? undefined }
        : def.access === "backoffice"
          ? { kind: "system", userId: userId ?? undefined }
          : userId
            ? { kind: "user", userId }
            : { kind: "system" };

    const args: RouteArgs<unknown, unknown> = {
      c,
      body,
      query,
      params: c.req.param() as Record<string, string>,
      auth,
      accountId,
      userId,
      db: (fn) => withContext(sql, ctx, fn),
      system: (fn) => withContext(sql, { kind: "system", userId: userId ?? undefined }, fn),
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
    };

    const idemKey = def.idempotent ? c.req.header("idempotency-key") : undefined;
    if (!idemKey) return respond(c, await handler(args));

    if (idemKey.length > 200) throw badRequest("invalid_idempotency_key", "Chave de idempotência longa demais.");
    const scope = accountId || `public:${c.req.path}`;
    const requestHash = createHash("sha256").update(`${c.req.method} ${c.req.path}\n${rawBody}`).digest("hex");
    const existing = await withContext(sql, { kind: "system" }, async (tx) => {
      const inserted = await tx`
        insert into idempotency_keys (scope, key, request_hash) values (${scope}, ${idemKey}, ${requestHash})
        on conflict do nothing returning key`;
      if (inserted.length) return null;
      const [row] = await tx`select request_hash, status_code, response from idempotency_keys where scope = ${scope} and key = ${idemKey}`;
      return row ?? null;
    });
    if (existing) {
      if (existing.request_hash !== requestHash)
        throw unprocessable("idempotency_key_reused", "Esta chave de idempotência já foi usada com outros dados.");
      if (existing.status_code == null) throw conflict("request_in_progress", "Esta requisição ainda está sendo processada.");
      c.header("Idempotent-Replayed", "true");
      return c.json(existing.response, existing.status_code);
    }
    try {
      const result = await handler(args);
      const status = result instanceof Created ? 201 : 200;
      const payload = result instanceof Created ? result.body : result;
      await withContext(sql, { kind: "system" }, (tx) =>
        tx`update idempotency_keys set status_code = ${status}, response = ${tx.json(payload as never)} where scope = ${scope} and key = ${idemKey}`,
      );
      return respond(c, result);
    } catch (err) {
      await withContext(sql, { kind: "system" }, (tx) => tx`delete from idempotency_keys where scope = ${scope} and key = ${idemKey}`);
      throw err;
    }
  }

  private authorize(def: RouteDef<z.ZodType, z.ZodType>, auth: Auth | null) {
    if (def.access === "public") return;
    if (!auth) throw unauthorized();
    if (def.access === "user") {
      if (auth.kind !== "session") throw forbidden("Esta rota é só para a pessoa logada, não para chaves de API.");
      return;
    }
    if (def.access === "backoffice") {
      if (auth.kind !== "session" || !auth.user.isBackoffice || auth.restrictedOrderId) throw forbidden();
      return;
    }
    // account
    if (auth.kind === "api_key") {
      if (!def.scope) throw forbidden("Esta ação só pode ser feita pelo painel.");
      if (!auth.scopes.includes(def.scope)) throw forbidden(`Esta chave não tem a permissão "${def.scope}".`);
      return;
    }
    if (auth.restrictedOrderId) throw forbidden();
    if (!auth.account) throw forbidden("Você ainda não tem uma conta de produtor.");
    if (!(def.roles ?? ROLES_ALL).includes(auth.account.role)) throw forbidden("Sua função na equipe não permite esta ação.");
  }

  private async authenticate(c: Context): Promise<Auth | null> {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    const tokenHash = hashToken(token);
    const { sql } = this.deps;

    if (token.startsWith("dm_live_") || token.startsWith("dm_test_")) {
      const [key] = await withContext(sql, { kind: "system" }, (tx) => tx`
        update api_keys k set last_used_at = now()
        from accounts a
        where k.key_hash = ${tokenHash} and k.revoked_at is null and a.id = k.account_id and a.status = 'active'
        returning k.id, k.account_id, k.scopes, k.env`);
      if (!key) throw unauthorized("Chave de API inválida ou revogada.");
      return { kind: "api_key", keyId: key.id, account: { id: key.account_id, role: "api" }, scopes: key.scopes, env: key.env };
    }

    const wantedAccount = c.req.header("domma-account");
    return withContext(sql, { kind: "system" }, async (tx) => {
      const [session] = await tx`
        select s.id, s.restricted_order_id, u.id as user_id, u.name, u.email, u.is_backoffice
        from sessions s join users u on u.id = s.user_id
        where s.token_hash = ${tokenHash} and s.revoked_at is null and s.expires_at > now()`;
      if (!session) throw unauthorized("Sua sessão terminou. Entre de novo.");
      const memberships = await tx`
        select m.account_id, m.role from account_members m join accounts a on a.id = m.account_id
        where m.user_id = ${session.user_id} and a.status <> 'closed' order by m.created_at`;
      const chosen = wantedAccount ? memberships.find((m) => m.account_id === wantedAccount) : memberships[0];
      if (wantedAccount && !chosen) throw forbidden("Você não faz parte desta conta.");
      return {
        kind: "session",
        sessionId: session.id,
        user: { id: session.user_id, name: session.name, email: session.email, isBackoffice: session.is_backoffice },
        restrictedOrderId: session.restricted_order_id,
        account: chosen ? { id: chosen.account_id, role: chosen.role } : null,
      } satisfies SessionAuth;
    });
  }
}

/** Resposta 201. */
export class Created {
  constructor(public readonly body: unknown) {}
}
export const created = (body: unknown) => new Created(body);

function respond(c: Context, result: unknown) {
  if (result instanceof Response) return result;
  if (result instanceof Created) return c.json(result.body as never, 201);
  return c.json((result ?? { ok: true }) as never);
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
  const first = fields[0];
  throw new ApiError(400, "invalid_request", first?.field ? `Revise o campo "${first.field}": ${first.message}` : (first?.message ?? "Dados inválidos."), fields);
}

export const ROLES_FINANCE: Role[] = ["owner", "admin", "finance"];
export const ROLES_ADMIN: Role[] = ["owner", "admin"];
/** Suporte não vê saldo nem saca; tráfego só lê vendas. */
export const ROLES_SALES: Role[] = ["owner", "admin", "finance", "support"];
