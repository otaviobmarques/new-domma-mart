import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Config } from "../env.ts";

/**
 * Armazenamento privado de arquivos. Nada é público: quem envia ou baixa recebe um endereço
 * assinado que vale por pouco tempo. Em produção usa um serviço compatível com S3; em
 * desenvolvimento, uma pasta no próprio servidor.
 */
export interface Storage {
  name: "s3" | "local";
  /** Endereço para o navegador enviar o arquivo direto, sem passar pela API. */
  uploadUrl(key: string, contentType: string, expiresSeconds: number): { url: string; headers: Record<string, string> };
  /** Endereço temporário para assistir ou baixar. */
  downloadUrl(key: string, expiresSeconds: number): string;
  /** Tamanho do arquivo já enviado, ou null se ele não existe. */
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

// ───────────────────────── S3 (assinatura AWS versão 4, na própria URL) ─────────────────────────

export interface S3Options {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** true: https://servidor/bucket/arquivo (R2, MinIO, Railway). false: https://bucket.servidor/arquivo (AWS). */
  pathStyle?: boolean;
}

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const sha256Hex = (data: string) => createHash("sha256").update(data).digest("hex");
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function presignS3(opts: S3Options, method: "GET" | "PUT" | "HEAD" | "DELETE", key: string, expiresSeconds: number, now = new Date()): string {
  const base = new URL(opts.endpoint);
  const pathStyle = opts.pathStyle ?? true;
  const host = pathStyle ? base.host : `${opts.bucket}.${base.host}`;
  const path = `${pathStyle ? `/${opts.bucket}` : ""}/${key.split("/").map(rfc3986).join("/")}`;
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${opts.region}/s3/aws4_request`;
  const query: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${opts.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = query
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .sort()
    .join("&");
  const canonicalRequest = [method, path, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${opts.secretAccessKey}`, day), opts.region), "s3"), "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  return `${base.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function s3Storage(opts: S3Options, fetchImpl: typeof fetch = fetch): Storage {
  return {
    name: "s3",
    uploadUrl: (key, contentType, expires) => ({ url: presignS3(opts, "PUT", key, expires), headers: { "content-type": contentType } }),
    downloadUrl: (key, expires) => presignS3(opts, "GET", key, expires),
    async size(key) {
      const res = await fetchImpl(presignS3(opts, "HEAD", key, 60), { method: "HEAD", signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Armazenamento respondeu ${res.status} ao conferir o arquivo`);
      return Number(res.headers.get("content-length") ?? 0);
    },
    async remove(key) {
      const res = await fetchImpl(presignS3(opts, "DELETE", key, 60), { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      if (!res.ok && res.status !== 404) throw new Error(`Armazenamento respondeu ${res.status} ao apagar o arquivo`);
    },
  };
}

// ───────────────────────── Pasta local (desenvolvimento e testes) ─────────────────────────

export interface LocalStorage extends Storage {
  /** Confere a assinatura do endereço. */
  verify(method: "GET" | "PUT", key: string, exp: string | undefined, sig: string | undefined, now?: number): boolean;
  /** Grava o que chegou no envio, parando se passar do limite. Devolve o tamanho. */
  write(key: string, body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<number>;
  /** Abre o arquivo, inteiro ou um trecho (para o player conseguir avançar o vídeo). */
  read(key: string, range?: { start: number; end: number }): Readable;
}

export function localStorage(dir: string, publicBase: string, secret: string): LocalStorage {
  const root = resolve(dir);
  const pathOf = (key: string) => {
    const full = resolve(join(root, key));
    if (!full.startsWith(`${root}/`)) throw new Error("Caminho de arquivo inválido");
    return full;
  };
  const sign = (method: string, key: string, exp: number) => createHmac("sha256", secret).update(`${method}\n${key}\n${exp}`).digest("hex");
  const url = (method: string, key: string, expires: number) => {
    const exp = Math.floor(Date.now() / 1000) + expires;
    return `${publicBase}/v1/storage/local/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sign(method, key, exp)}`;
  };
  return {
    name: "local",
    uploadUrl: (key, contentType, expires) => ({ url: url("PUT", key, expires), headers: { "content-type": contentType } }),
    downloadUrl: (key, expires) => url("GET", key, expires),
    async size(key) {
      return stat(pathOf(key)).then(
        (s) => s.size,
        () => null,
      );
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
    verify(method, key, exp, sig, now = Date.now()) {
      const seconds = Number(exp);
      if (!sig || !Number.isFinite(seconds) || seconds * 1000 < now) return false;
      const expected = Buffer.from(sign(method, key, seconds));
      const given = Buffer.from(sig);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
    async write(key, body, maxBytes) {
      if (!body) throw new Error("Envio vazio");
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      let total = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _enc, done) {
          total += chunk.length;
          done(total > maxBytes ? new Error("too_large") : null, chunk);
        },
      });
      try {
        await pipeline(Readable.fromWeb(body as never), limit, createWriteStream(path));
      } catch (err) {
        await rm(path, { force: true });
        throw err;
      }
      return total;
    },
    read: (key, range) => createReadStream(pathOf(key), range),
  };
}

export function defaultStorage(config: Config): Storage {
  if (config.s3)
    return s3Storage(config.s3);
  return localStorage(config.storageDir, config.apiUrl, config.blindIndexKey);
}
