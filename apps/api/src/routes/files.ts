import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { Tx } from "@domma/db";
import { withContext } from "@domma/db";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { ApiError, forbidden, notFound, unprocessable } from "../lib/errors.ts";
import { ROLES_ADMIN, type Router, created } from "../lib/router.ts";
import { audit } from "../services/audit.ts";
import { type LocalStorage, type Storage, defaultStorage } from "../services/storage.ts";
import { uuidOr404 } from "./seller.ts";

const MB = 1024 * 1024;
const IMAGES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** O que pode ser enviado em cada caso, e até que tamanho. */
export const FILE_RULES = {
  kyc_document: { types: { ...IMAGES, "application/pdf": "pdf" }, maxBytes: 10 * MB, label: "documento" },
  kyc_selfie: { types: IMAGES, maxBytes: 10 * MB, label: "selfie" },
  lesson_video: { types: { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }, maxBytes: 2048 * MB, label: "vídeo" },
} as const satisfies Record<string, { types: Record<string, string>; maxBytes: number; label: string }>;

export type FilePurpose = keyof typeof FILE_RULES;

const storages = new WeakMap<Deps, Storage>();
export function storageOf(deps: Deps): Storage {
  if (deps.storage) return deps.storage;
  let s = storages.get(deps);
  if (!s) storages.set(deps, (s = defaultStorage(deps.config)));
  return s;
}

/** Endereço temporário de um arquivo já enviado. Vídeo vale 4 horas (uma sessão de estudo); o resto, 5 minutos. */
export function signedUrl(deps: Deps, file: { storage_key: string; purpose: string }): string {
  return storageOf(deps).downloadUrl(file.storage_key, file.purpose === "lesson_video" ? 4 * 3600 : 300);
}

/** Marca o arquivo como apagado e tira do armazenamento. Se a remoção falhar, o registro já não aponta mais para ele. */
export async function discardFile(tx: Tx, deps: Deps, fileId: string | null | undefined) {
  if (!fileId) return;
  const [file] = await tx`update files set status = 'deleted' where id = ${fileId} and status <> 'deleted' returning storage_key`;
  if (file) await storageOf(deps).remove(file.storage_key).catch((err) => console.error("[arquivos] não foi possível apagar do armazenamento:", err));
}

export function fileRoutes(r: Router, deps: Deps) {
  const storage = () => storageOf(deps);

  r.post(
    "/v1/files",
    {
      access: "account",
      tag: "Arquivos",
      summary: "Preparar o envio de um arquivo (documento de verificação ou vídeo de aula). Devolve o endereço para enviar direto.",
      roles: ROLES_ADMIN,
      body: z.object({
        purpose: z.enum(["kyc_document", "kyc_selfie", "lesson_video"]),
        filename: z.string().trim().min(1).max(200),
        content_type: z.string().trim().toLowerCase().max(100),
        size_bytes: z.number().int().positive(),
        lesson_id: z.uuid().optional(),
      }),
    },
    async ({ body, db, accountId, userId }) =>
      db(async (tx) => {
        const rule = FILE_RULES[body.purpose];
        const ext = (rule.types as Record<string, string>)[body.content_type];
        if (!ext) throw unprocessable("file_type", `Este tipo de arquivo não é aceito para ${rule.label}. Use ${Object.values(rule.types).join(", ").toUpperCase()}.`);
        if (body.size_bytes > rule.maxBytes) throw unprocessable("file_too_large", `O arquivo passa do limite de ${rule.maxBytes >= 1024 * MB ? `${rule.maxBytes / (1024 * MB)} GB` : `${rule.maxBytes / MB} MB`}.`);
        if (body.purpose === "lesson_video") {
          if (!body.lesson_id) throw unprocessable("lesson_required", "Informe a aula que vai receber o vídeo.");
          const [lesson] = await tx`select id from lessons where id = ${body.lesson_id}`;
          if (!lesson) throw notFound("Aula");
        }
        const id = randomUUID();
        const key = `${body.purpose}/${accountId}/${body.lesson_id ? `${body.lesson_id}/` : ""}${id}.${ext}`;
        await tx`
          insert into files (id, account_id, uploaded_by, purpose, storage_key, filename, content_type, size_bytes)
          values (${id}, ${accountId}, ${userId}, ${body.purpose}, ${key}, ${body.filename}, ${body.content_type}, ${body.size_bytes})`;
        const upload = storage().uploadUrl(key, body.content_type, 3600);
        return created({ file_id: id, upload: { method: "PUT", ...upload } });
      }),
  );

  r.post(
    "/v1/files/:id/complete",
    { access: "account", tag: "Arquivos", summary: "Confirmar que o envio terminou. O servidor confere o arquivo antes de aceitar.", roles: ROLES_ADMIN },
    async ({ params, db, auth }) =>
      db(async (tx) => {
        const [file] = await tx`select * from files where id = ${uuidOr404(params.id!)} for update`;
        if (!file || file.status === "deleted") throw notFound("Arquivo");
        if (file.status === "ready") return { file_id: file.id, status: "ready" };
        const size = await storage().size(file.storage_key);
        if (size == null) throw unprocessable("upload_missing", "O arquivo ainda não chegou. Tente enviar de novo.");
        // O tamanho de verdade é o que vale, não o que o navegador declarou.
        if (size === 0 || size > FILE_RULES[file.purpose as FilePurpose].maxBytes) {
          await discardFile(tx, deps, file.id);
          throw unprocessable("file_too_large", "O arquivo enviado está vazio ou passa do limite.");
        }
        await tx`update files set status = 'ready', size_bytes = ${size} where id = ${file.id}`;
        if (file.purpose === "lesson_video") {
          const lessonId = (file.storage_key as string).split("/")[2]!;
          const [lesson] = await tx`select id, video_file_id from lessons where id = ${lessonId} for update`;
          if (!lesson) throw notFound("Aula");
          await tx`update lessons set video_file_id = ${file.id}, video_url = null where id = ${lesson.id}`;
          await discardFile(tx, deps, lesson.video_file_id);
          await audit(tx, { auth, action: "lesson.video_uploaded", target: lesson.id, data: { size_bytes: size } });
        }
        return { file_id: file.id, status: "ready", size_bytes: size };
      }),
  );

  r.delete("/v1/lessons/:id/video", { access: "account", tag: "Conteúdo", summary: "Tirar o vídeo enviado de uma aula", scope: "products:write", roles: ROLES_ADMIN }, async ({ params, db }) =>
    db(async (tx) => {
      const [lesson] = await tx`select id, video_file_id from lessons where id = ${uuidOr404(params.id!)} for update`;
      if (!lesson) throw notFound("Aula");
      await tx`update lessons set video_file_id = null where id = ${lesson.id}`;
      await discardFile(tx, deps, lesson.video_file_id);
      return { ok: true };
    }),
  );

  // ── Armazenamento em pasta local (desenvolvimento): os mesmos endereços assinados, servidos pela própria API.

  const local = (): LocalStorage => {
    const s = storage();
    if (s.name !== "local") throw notFound("Rota");
    return s as LocalStorage;
  };

  r.put("/v1/storage/local/:key{.+}", { access: "public", tag: "Arquivos", summary: "Envio de arquivo (desenvolvimento)", hidden: true }, async ({ c, params }) => {
    const key = params.key!;
    if (!local().verify("PUT", key, c.req.query("exp"), c.req.query("sig"), deps.now().getTime())) throw forbidden("Endereço de envio inválido ou vencido.");
    const [file] = await withContext(deps.sql, { kind: "system" }, (tx) => tx`select purpose, status from files where storage_key = ${key}`);
    if (!file || file.status !== "pending") throw notFound("Arquivo");
    try {
      await local().write(key, c.req.raw.body, FILE_RULES[file.purpose as FilePurpose].maxBytes);
    } catch (err) {
      if (err instanceof Error && err.message === "too_large") throw new ApiError(413, "file_too_large", "O arquivo passa do limite.");
      throw err;
    }
    return { ok: true };
  });

  r.get("/v1/storage/local/:key{.+}", { access: "public", tag: "Arquivos", summary: "Leitura de arquivo (desenvolvimento)", hidden: true }, async ({ c, params }) => {
    const key = params.key!;
    const store = local();
    if (!store.verify("GET", key, c.req.query("exp"), c.req.query("sig"), deps.now().getTime())) throw forbidden("Endereço inválido ou vencido.");
    const [file] = await withContext(deps.sql, { kind: "system" }, (tx) => tx`select content_type from files where storage_key = ${key} and status = 'ready'`);
    const size = file ? await store.size(key) : null;
    if (!file || size == null) throw notFound("Arquivo");
    const headers: Record<string, string> = { "content-type": file.content_type, "accept-ranges": "bytes", "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
    // Trecho do arquivo: é assim que o player avança o vídeo sem baixar tudo.
    const match = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
    if (match && (match[1] || match[2])) {
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      return new Response(Readable.toWeb(store.read(key, { start, end })) as never, {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
      });
    }
    return new Response(Readable.toWeb(store.read(key)) as never, { headers: { ...headers, "content-length": String(size) } });
  });
}
