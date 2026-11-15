import { classifyIdentifier, formatPhone, isValidEmail, isValidPhone, normalizeEmail, onlyDigits } from "@domma/core";
import type { Tx } from "@domma/db";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { badRequest, forbidden, unprocessable } from "../lib/errors.ts";
import type { RateLimiter } from "../lib/rate-limit.ts";
import type { RouteArgs, Router } from "../lib/router.ts";
import { audit } from "../services/audit.ts";
import { CODE_ERRORS, type CodePurpose, checkCode, consumeMagicLink, createSession, findUserByIdentifier, identifierHash, issueCode } from "../services/auth.ts";

export async function createAccountForUser(tx: Tx, userId: string, name: string, intent?: string | null) {
  const [account] = await tx`insert into accounts (owner_user_id, name, intent) values (${userId}, ${name}, ${intent ?? null}) returning id`;
  await tx`insert into account_members (account_id, user_id, role) values (${account!.id}, ${userId}, 'owner')`;
  await tx`insert into ledger_accounts (account_id, kind) values (${account!.id}, 'available'), (${account!.id}, 'pending'), (${account!.id}, 'reserved')`;
  return account!.id as string;
}

/** Segundo fator: confere o código enviado para a pessoa antes de saque, troca de chave Pix e criação de chave de API. */
export async function requireConfirmation(deps: Deps, args: RouteArgs<unknown, unknown>, purpose: CodePurpose, code: string) {
  if (args.auth?.kind !== "session") throw forbidden("Esta ação só pode ser feita pelo painel, com confirmação por código.");
  const result = await args.system((tx) => checkCode(tx, { key: `confirm:${args.auth!.kind === "session" ? args.userId : ""}`, purpose, code }));
  if (!result.ok) throw unprocessable("invalid_code", CODE_ERRORS[result.reason]);
}

export function authRoutes(r: Router, deps: Deps, limiter: RateLimiter) {
  const { config } = deps;
  const devCode = (code: string | null) => (config.env === "production" || !code ? {} : { dev_code: code });

  r.post(
    "/v1/auth/signup",
    {
      access: "public",
      tag: "Entrada",
      summary: "Criar conta de produtor (envia código de confirmação)",
      body: z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().max(254).refine(isValidEmail, "E-mail inválido"),
        phone: z.string().refine(isValidPhone, "Celular inválido"),
        intent: z.string().trim().max(500).optional(),
      }),
    },
    async ({ body, system, ip }) => {
      limiter.check(`signup:${ip}`, 10, 10 * 60_000);
      const email = normalizeEmail(body.email);
      const key = identifierHash(config, "email", email);
      const code = await system(async (tx) => {
        const [existing] = await tx`select id from users where email = ${email}`;
        // Se o e-mail já existe, mandamos um código de entrada normal — sem revelar isso na resposta.
        return issueCode(tx, config, {
          key,
          purpose: "login",
          email,
          userId: existing?.id ?? null,
          payload: { signup: { name: body.name, phone: onlyDigits(body.phone), intent: body.intent ?? null } },
        });
      });
      return { ok: true, identifier: email, ...devCode(code) };
    },
  );

  r.post(
    "/v1/auth/code",
    {
      access: "public",
      tag: "Entrada",
      summary: "Pedir código de entrada por e-mail, celular ou CPF",
      body: z.object({ identifier: z.string().trim().min(3).max(254) }),
    },
    async ({ body, system, ip }) => {
      limiter.check(`code:${ip}`, 10, 10 * 60_000);
      const id = classifyIdentifier(body.identifier);
      if (!id) throw badRequest("invalid_identifier", "Digite o e-mail, o celular com DDD ou o CPF que você usou.");
      limiter.check(`code:${id.value}`, 5, 10 * 60_000);
      const code = await system(async (tx) => {
        const found = await findUserByIdentifier(tx, config, body.identifier);
        if (!found) return null;
        return issueCode(tx, config, { key: identifierHash(config, id.kind, id.value), purpose: "login", email: found.user.email, userId: found.user.id });
      });
      // A resposta é a mesma exista ou não a pessoa, para não revelar quem tem cadastro.
      return { ok: true, ...devCode(code) };
    },
  );

  r.post(
    "/v1/auth/verify",
    {
      access: "public",
      tag: "Entrada",
      summary: "Confirmar o código e abrir a sessão",
      body: z.object({ identifier: z.string().trim().min(3).max(254), code: z.string().regex(/^\d{6}$/, "O código tem 6 dígitos") }),
    },
    async ({ body, system, ip, c }) => {
      limiter.check(`verify:${ip}`, 30, 10 * 60_000);
      const id = classifyIdentifier(body.identifier);
      if (!id) throw badRequest("invalid_identifier", "Identificação inválida.");
      const key = identifierHash(config, id.kind, id.value);
      const check = await system((tx) => checkCode(tx, { key, purpose: "login", code: body.code }));
      if (!check.ok) throw unprocessable("invalid_code", CODE_ERRORS[check.reason]);

      return system(async (tx) => {
        let userId = check.userId;
        const signup = (check.payload as { signup?: { name: string; phone: string; intent: string | null } } | null)?.signup;
        if (!userId) {
          if (!signup || id.kind !== "email") throw unprocessable("invalid_code", CODE_ERRORS.invalid);
          const [user] = await tx`
            insert into users (name, email, phone, phone_hash)
            values (${signup.name}, ${id.value}, ${formatPhone(signup.phone)}, ${identifierHash(config, "phone", signup.phone)})
            on conflict (email) do update set updated_at = now() returning id`;
          userId = user!.id as string;
        }
        if (signup) {
          const [member] = await tx`select 1 from account_members where user_id = ${userId} limit 1`;
          if (!member) {
            const accountId = await createAccountForUser(tx, userId, signup.name, signup.intent);
            await audit(tx, { actorKind: "user", accountId, action: "account.created", data: { user_id: userId } });
          }
        }
        if (config.backofficeEmails.length) {
          await tx`update users set is_backoffice = (email = any(${config.backofficeEmails})) where id = ${userId}`;
        }
        const token = await createSession(tx, userId, { userAgent: c.req.header("user-agent") });
        const [user] = await tx`select id, name, email, is_backoffice from users where id = ${userId}`;
        const [member] = await tx`select 1 from account_members where user_id = ${userId} limit 1`;
        return { token, user, has_account: Boolean(member) };
      });
    },
  );

  r.post(
    "/v1/auth/magic",
    { access: "public", tag: "Entrada", summary: "Entrar com link de acesso direto", body: z.object({ token: z.string().min(20).max(200) }) },
    async ({ body, system, ip, c }) => {
      limiter.check(`magic:${ip}`, 30, 10 * 60_000);
      return system(async (tx) => {
        const link = await consumeMagicLink(tx, body.token);
        if (!link) throw unprocessable("invalid_link", "Este link já foi usado ou venceu. Peça um código para entrar.");
        const token = await createSession(tx, link.user_id, { userAgent: c.req.header("user-agent"), restrictedOrderId: link.restricted_order_id });
        return { token, redirect_to: link.redirect_to ?? "/compras" };
      });
    },
  );

  r.post("/v1/auth/logout", { access: "user", tag: "Entrada", summary: "Encerrar a sessão" }, async ({ auth, system }) => {
    if (auth?.kind === "session") await system((tx) => tx`update sessions set revoked_at = now() where id = ${auth.sessionId}`);
    return { ok: true };
  });

  r.get("/v1/me", { access: "user", tag: "Entrada", summary: "Quem está logado e em quais contas" }, async ({ auth, system }) => {
    if (auth?.kind !== "session") throw forbidden();
    const accounts = await system((tx) => tx`
      select a.id, a.name, m.role, a.kyc_status, a.status from account_members m join accounts a on a.id = m.account_id
      where m.user_id = ${auth.user.id} and a.status <> 'closed' order by m.created_at`);
    return {
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, is_backoffice: auth.user.isBackoffice },
      accounts: auth.restrictedOrderId ? [] : accounts,
      current_account_id: auth.restrictedOrderId ? null : (auth.account?.id ?? null),
      restricted: Boolean(auth.restrictedOrderId),
    };
  });

  r.post(
    "/v1/account",
    {
      access: "user",
      tag: "Conta",
      summary: "Quem já é comprador cria a sua conta de produtor",
      body: z.object({ intent: z.string().trim().max(500).optional() }),
    },
    async ({ auth, body, system }) => {
      if (auth?.kind !== "session" || auth.restrictedOrderId) throw forbidden("Entre com o seu código para criar uma conta de produtor.");
      return system(async (tx) => {
        const [member] = await tx`select account_id from account_members where user_id = ${auth.user.id} limit 1`;
        if (member) return { account_id: member.account_id };
        const accountId = await createAccountForUser(tx, auth.user.id, auth.user.name, body.intent);
        await audit(tx, { auth, accountId, action: "account.created" });
        return { account_id: accountId };
      });
    },
  );

  r.post(
    "/v1/auth/confirmation-code",
    {
      access: "account",
      tag: "Entrada",
      summary: "Enviar código de segundo fator (saque, chave Pix, chave de API)",
      body: z.object({ purpose: z.enum(["withdrawal", "pix_key", "api_key"]) }),
    },
    async ({ auth, body, system }) => {
      if (auth?.kind !== "session") throw forbidden();
      limiter.check(`confirm:${auth.user.id}`, 8, 10 * 60_000);
      const code = await system((tx) => issueCode(tx, config, { key: `confirm:${auth.user.id}`, purpose: body.purpose, email: auth.user.email, userId: auth.user.id }));
      return { ok: true, ...devCode(code) };
    },
  );
}
