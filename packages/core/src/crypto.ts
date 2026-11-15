import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Token aleatório seguro para URL (sessões, links de acesso, segredos de webhook). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens são guardados apenas como hash; o valor completo só existe com o dono. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function keyFromBase64(key: string): Buffer {
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY precisa ter 32 bytes em base64");
  return buf;
}

/** Criptografia por campo (AES-256-GCM) para CPF, CNPJ e chave Pix. Formato: v1.iv.tag.dados */
export function encryptField(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromBase64(keyB64), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptField(payload: string, keyB64: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Campo criptografado em formato desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", keyFromBase64(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Índice cego: permite buscar por CPF/telefone sem guardar o dado em claro. */
export function blindIndex(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

/**
 * Assinatura de webhook: HMAC-SHA256 de "timestamp.corpo" com o segredo do endpoint.
 * Cabeçalho: Domma-Signature: t=<unix>,v1=<hex>
 */
export function signWebhook(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export function verifyWebhook(body: string, header: string | null | undefined, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return safeEqual(expected, parts.v1);
}
