import { type IdentifierKind, classifyIdentifier } from "@domma/core";
import { blindIndex, generateOtp, hashToken, randomToken, safeEqual } from "@domma/core/server";
import type { Tx } from "@domma/db";
import type { Config } from "../env.ts";
import { enqueueEmail } from "./notify.ts";

export type CodePurpose = "login" | "signup" | "withdrawal" | "pix_key" | "api_key";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;

export function identifierHash(config: Config, kind: IdentifierKind, value: string) {
  return blindIndex(`${kind}:${value}`, config.blindIndexKey);
}

/** Acha a pessoa pelo e-mail, celular ou CPF usado na compra ("Encontrar minha compra"). */
export async function findUserByIdentifier(tx: Tx, config: Config, input: string) {
  const id = classifyIdentifier(input);
  if (!id) return null;
  const rows =
    id.kind === "email"
      ? await tx`select id, name, email from users where email = ${id.value}`
      : id.kind === "cpf"
        ? await tx`select id, name, email from users where cpf_hash = ${identifierHash(config, "cpf", id.value)} order by created_at limit 1`
        : await tx`select id, name, email from users where phone_hash = ${identifierHash(config, "phone", id.value)} order by created_at limit 1`;
  const user = rows[0] as { id: string; name: string; email: string } | undefined;
  return user ? { user, identifier: id } : null;
}

/** Gera o código de 6 dígitos, guarda só o hash e coloca o e-mail na fila. */
export async function issueCode(
  tx: Tx,
  config: Config,
  input: { key: string; purpose: CodePurpose; email: string; userId?: string | null; payload?: Record<string, unknown> },
): Promise<string> {
  const code = generateOtp();
  await tx`update login_codes set used_at = now() where identifier_hash = ${input.key} and purpose = ${input.purpose} and used_at is null`;
  await tx`
    insert into login_codes (user_id, identifier_hash, purpose, code_hash, payload, expires_at)
    values (${input.userId ?? null}, ${input.key}, ${input.purpose}, ${hashToken(`${input.key}:${code}`)},
            ${input.payload ? tx.json(input.payload as never) : null}, now() + make_interval(mins => ${CODE_TTL_MIN}))`;
  await enqueueEmail(tx, input.email, "login_code", { code });
  return code;
}

export type CodeCheck = { ok: true; userId: string | null; payload: Record<string, unknown> | null } | { ok: false; reason: "invalid" | "expired" | "too_many" };

/**
 * Confere o código. Não lança erro: as tentativas erradas precisam ficar gravadas,
 * então quem chama decide o que responder depois de confirmar a transação.
 */
export async function checkCode(tx: Tx, input: { key: string; purpose: CodePurpose; code: string }): Promise<CodeCheck> {
  const [row] = await tx`
    select id, user_id, code_hash, payload, attempts, expires_at < now() as expired
    from login_codes where identifier_hash = ${input.key} and purpose = ${input.purpose} and used_at is null
    order by created_at desc limit 1 for update`;
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expired) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" };
  if (!safeEqual(row.code_hash, hashToken(`${input.key}:${input.code}`))) {
    await tx`update login_codes set attempts = attempts + 1 where id = ${row.id}`;
    return { ok: false, reason: "invalid" };
  }
  await tx`update login_codes set used_at = now() where id = ${row.id}`;
  return { ok: true, userId: row.user_id, payload: row.payload };
}

export const CODE_ERRORS = {
  invalid: "Código incorreto. Confira e tente de novo.",
  expired: "Este código venceu. Peça um novo.",
  too_many: "Muitas tentativas com este código. Peça um novo.",
} as const;

export async function createSession(tx: Tx, userId: string, opts: { userAgent?: string; restrictedOrderId?: string | null } = {}) {
  const token = `dms_${randomToken(32)}`;
  await tx`
    insert into sessions (user_id, token_hash, user_agent, restricted_order_id, expires_at)
    values (${userId}, ${hashToken(token)}, ${opts.userAgent?.slice(0, 300) ?? null}, ${opts.restrictedOrderId ?? null}, now() + make_interval(days => ${SESSION_DAYS}))`;
  return token;
}

/** Link de acesso direto, de uso único. */
export async function createMagicLink(
  tx: Tx,
  config: Config,
  input: { userId: string; redirectTo: string; restrictedOrderId?: string | null; ttlMinutes: number },
) {
  const token = randomToken(32);
  await tx`
    insert into magic_links (user_id, token_hash, redirect_to, restricted_order_id, expires_at)
    values (${input.userId}, ${hashToken(token)}, ${input.redirectTo}, ${input.restrictedOrderId ?? null}, now() + make_interval(mins => ${input.ttlMinutes}))`;
  return `${config.webUrl}/acesso/${token}`;
}

export async function consumeMagicLink(tx: Tx, token: string) {
  const [row] = await tx`
    update magic_links set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning user_id, redirect_to, restricted_order_id`;
  return row as { user_id: string; redirect_to: string | null; restricted_order_id: string | null } | undefined;
}
