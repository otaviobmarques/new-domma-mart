"use client";

import { completeUpload, prepareUpload } from "@/app/painel/actions";

type Purpose = "kyc_document" | "kyc_selfie" | "lesson_video";

/**
 * Envia um arquivo direto do navegador para o armazenamento privado: a API prepara um endereço
 * temporário, o arquivo sobe por ele (com progresso) e a API confere antes de aceitar.
 */
export async function uploadFile(file: File, purpose: Purpose, opts: { lessonId?: string; onProgress?: (percent: number) => void } = {}): Promise<{ ok: true; fileId: string; sizeBytes: number } | { ok: false; error: string }> {
  const prepared = await prepareUpload({ purpose, filename: file.name.slice(0, 200), content_type: file.type || "application/octet-stream", size_bytes: file.size, lesson_id: opts.lessonId });
  if (!prepared.ok) return prepared;
  const sent = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(prepared.upload.method, prepared.upload.url);
    for (const [name, value] of Object.entries(prepared.upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = xhr.onabort = () => resolve(false);
    xhr.send(file);
  });
  if (!sent) return { ok: false, error: "O envio não terminou. Confira a internet e tente de novo." };
  const done = await completeUpload(prepared.file_id);
  if (!done.ok) return done;
  return { ok: true, fileId: done.file_id, sizeBytes: done.size_bytes };
}

export const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
