import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { presignS3, s3Storage } from "../src/services/storage.ts";
import { BUYER, type Harness, createHarness } from "./harness.ts";

let h: Harness;
let app: ReturnType<typeof createApp>["app"];
beforeAll(async () => {
  h = await createHarness();
  h.deps.config.storageDir = mkdtempSync(join(tmpdir(), "domma-arquivos-"));
  app = createApp(h.deps).app;
});
afterAll(() => h.close());

const local = (url: string) => url.replace("http://localhost:4000", "");
/** Envia um arquivo pelo caminho completo: preparar, enviar direto e confirmar. */
async function upload(token: string, body: Record<string, unknown>, bytes: Uint8Array) {
  const prepared = await h.api("POST", "/v1/files", { token, body: { size_bytes: bytes.length, ...body } });
  if (prepared.status !== 201) return { prepared, put: null, done: null };
  const put = await app.request(local(prepared.body.upload.url), { method: "PUT", headers: prepared.body.upload.headers, body: bytes });
  const done = await h.api("POST", `/v1/files/${prepared.body.file_id}/complete`, { token });
  return { prepared, put, done };
}
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe("armazenamento privado", () => {
  it("assina endereços S3 igual ao exemplo oficial da AWS", () => {
    const url = presignS3(
      { endpoint: "https://s3.amazonaws.com", region: "us-east-1", bucket: "examplebucket", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", pathStyle: false },
      "GET",
      "test.txt",
      86400,
      new Date("2013-05-24T00:00:00Z"),
    );
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("no S3, confere tamanho e apaga pelo endereço assinado", async () => {
    const calls: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      return new Response(null, { status: init.method === "HEAD" ? 200 : 204, headers: { "content-length": "1234" } });
    }) as unknown as typeof fetch;
    const s3 = s3Storage({ endpoint: "https://armazenamento.exemplo", region: "auto", bucket: "domma", accessKeyId: "a", secretAccessKey: "b" }, fake);
    expect(await s3.size("lesson_video/x/y.mp4")).toBe(1234);
    await s3.remove("lesson_video/x/y.mp4");
    expect(calls).toEqual(["HEAD /domma/lesson_video/x/y.mp4", "DELETE /domma/lesson_video/x/y.mp4"]);
    expect(s3.uploadUrl("a b/ç.mp4", "video/mp4", 60).url).toContain("/domma/a%20b/%C3%A7.mp4?");
  });
});

describe("verificação de identidade com documento e selfie", () => {
  it("exige as fotos, vai para análise e só a equipe vê os documentos", async () => {
    h.deps.config.kycReview = "manual";
    const producer = await h.producer("kyc@example.com");
    const other = await h.producer("kyc-outro@example.com");
    const base = { document: "529.982.247-25", pix_key: "kyc@example.com" };
    expect((await h.api("GET", "/v1/account", { token: producer.token })).body.kyc_requires_documents).toBe(true);
    expect((await h.api("POST", "/v1/account/verification", { token: producer.token, body: base })).body.error.code).toBe("documents_required");

    // Tipo e tamanho são conferidos antes do envio.
    expect((await upload(producer.token, { purpose: "kyc_selfie", filename: "selfie.pdf", content_type: "application/pdf" }, JPG)).prepared.status).toBe(422);
    expect((await h.api("POST", "/v1/files", { token: producer.token, body: { purpose: "kyc_document", filename: "rg.jpg", content_type: "image/jpeg", size_bytes: 11 * 1024 * 1024 } })).body.error.code).toBe("file_too_large");

    const front = await upload(producer.token, { purpose: "kyc_document", filename: "rg-frente.jpg", content_type: "image/jpeg" }, JPG);
    expect(front.put!.status).toBe(200);
    expect(front.done!.body).toMatchObject({ status: "ready", size_bytes: 8 });
    const selfie = await upload(producer.token, { purpose: "kyc_selfie", filename: "selfie.jpg", content_type: "image/jpeg" }, JPG);
    // Confirmar sem ter enviado não vale.
    const ghost = await h.api("POST", "/v1/files", { token: producer.token, body: { purpose: "kyc_selfie", filename: "x.jpg", content_type: "image/jpeg", size_bytes: 10 } });
    expect((await h.api("POST", `/v1/files/${ghost.body.file_id}/complete`, { token: producer.token })).body.error.code).toBe("upload_missing");
    // Outra conta não usa os arquivos desta.
    const stolen = await h.api("POST", "/v1/account/verification", { token: other.token, body: { ...base, document: "111.444.777-35", document_front_file_id: front.prepared.body.file_id, selfie_file_id: selfie.prepared.body.file_id } });
    expect(stolen.body.error.code).toBe("file_not_ready");
    // Selfie no lugar do documento também não.
    const swapped = await h.api("POST", "/v1/account/verification", { token: producer.token, body: { ...base, document_front_file_id: selfie.prepared.body.file_id, selfie_file_id: selfie.prepared.body.file_id } });
    expect(swapped.body.error.code).toBe("file_not_ready");

    const sent = await h.api("POST", "/v1/account/verification", { token: producer.token, body: { ...base, document_front_file_id: front.prepared.body.file_id, selfie_file_id: selfie.prepared.body.file_id } });
    expect(sent.body).toEqual({ kyc_status: "in_review" });
    expect((await h.api("POST", "/v1/account/verification", { token: producer.token, body: base })).body.error.code).toBe("already_in_review");

    expect((await h.api("GET", `/v1/backoffice/accounts/${producer.accountId}/kyc-documents`, { token: producer.token })).status).toBe(403);
    const staff = await h.producer("equipe@domma.test", "Equipe Domma");
    const queue = await h.api("GET", "/v1/backoffice/queue", { token: staff.token });
    expect(queue.body.accounts.find((a: any) => a.id === producer.accountId).documents_sent_at).toBeTruthy();
    const docs = await h.api("GET", `/v1/backoffice/accounts/${producer.accountId}/kyc-documents`, { token: staff.token });
    expect(docs.body).toMatchObject({ status: "pending", document_number: "52998224725", document_back: null });
    const image = await app.request(local(docs.body.selfie.url));
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(JPG);
    // Sem assinatura, com assinatura trocada ou vencida, o arquivo não sai.
    const u = new URL(docs.body.selfie.url);
    expect((await app.request(u.pathname)).status).toBe(403);
    expect((await app.request(`${u.pathname}?exp=${u.searchParams.get("exp")}&sig=${"0".repeat(64)}`)).status).toBe(403);
    h.clock.now = new Date(Date.now() + 10 * 60_000);
    expect((await app.request(local(docs.body.selfie.url))).status).toBe(403);
    h.clock.now = null;
    const [viewed] = await h.system((tx) => tx`select actor_user_id from audit_log where action = 'account.kyc_documents_viewed' and account_id = ${producer.accountId}`);
    expect(viewed!.actor_user_id).toBe(staff.userId);

    // Devolvida para correção: o produtor é avisado e envia de novo.
    await h.api("POST", `/v1/backoffice/accounts/${producer.accountId}/kyc`, { token: staff.token, body: { decision: "pending", note: "A foto do documento está cortada." } });
    expect((await h.api("GET", "/v1/account", { token: producer.token })).body).toMatchObject({ kyc_status: "pending", kyc_note: "A foto do documento está cortada." });
    const again = await h.api("POST", "/v1/account/verification", { token: producer.token, body: { ...base, document_front_file_id: front.prepared.body.file_id, selfie_file_id: selfie.prepared.body.file_id } });
    expect(again.body.kyc_status).toBe("in_review");
    await h.api("POST", `/v1/backoffice/accounts/${producer.accountId}/kyc`, { token: staff.token, body: { decision: "approve" } });
    expect((await h.api("GET", "/v1/account", { token: producer.token })).body.kyc_status).toBe("approved");
    const subs = await h.system((tx) => tx`select status from kyc_submissions where account_id = ${producer.accountId} order by created_at`);
    expect(subs.map((s) => s.status)).toEqual(["returned", "approved"]);
    const mails = await h.system((tx) => tx`select data->>'title' as title from outbox_messages where recipient = 'kyc@example.com' and template = 'notice' order by created_at`);
    expect(mails.map((m) => m.title)).toEqual(["Falta um ajuste na sua verificação", "Sua identidade foi verificada"]);
    h.deps.config.kycReview = "auto";
  });
});

describe("vídeo das aulas enviado para a plataforma", () => {
  it("só quem comprou assiste, por endereço temporário, e o player consegue avançar", async () => {
    const producer = await h.producer("video@example.com");
    const product = await h.product(producer.token);
    const lessonId = (await h.api("GET", `/v1/products/${product.id}`, { token: producer.token })).body.modules[0].lessons[0].id;
    const video = new Uint8Array(5000).map((_, i) => i % 251);

    expect((await upload(producer.token, { purpose: "lesson_video", filename: "aula.mp4", content_type: "video/mp4" }, video)).prepared.body.error.code).toBe("lesson_required");
    expect((await upload(producer.token, { purpose: "lesson_video", filename: "aula.exe", content_type: "application/octet-stream", lesson_id: lessonId }, video)).prepared.status).toBe(422);
    const other = await h.producer("video-outro@example.com");
    expect((await upload(other.token, { purpose: "lesson_video", filename: "aula.mp4", content_type: "video/mp4", lesson_id: lessonId }, video)).prepared.status).toBe(404);

    const first = await upload(producer.token, { purpose: "lesson_video", filename: "aula 1.mp4", content_type: "video/mp4", lesson_id: lessonId }, video);
    expect(first.done!.body.status).toBe("ready");
    const lesson = (await h.api("GET", `/v1/products/${product.id}`, { token: producer.token })).body.modules[0].lessons[0];
    expect(lesson.video_file).toMatchObject({ filename: "aula 1.mp4", size_bytes: 5000 });
    expect(lesson.storage_key).toBeUndefined();

    const order = await h.buyPix(product.slug, { email: "aluna-video@example.com" });
    const session = (await h.api("POST", "/v1/public/orders/" + order.order_id + "/access", { body: { token: order.token } })).body.session_token;
    const content = await h.api("GET", `/v1/buyer/products/${product.id}/content`, { token: session });
    const url = content.body.modules[0].lessons[0].video_url as string;
    expect(url).toContain("/v1/storage/local/lesson_video/");
    expect(content.body.modules[0].lessons[0].storage_key).toBeUndefined();

    const whole = await app.request(local(url));
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect((await whole.arrayBuffer()).byteLength).toBe(5000);
    const part = await app.request(local(url), { headers: { range: "bytes=1000-1999" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 1000-1999/5000");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(video.slice(1000, 2000));
    const tail = await app.request(local(url), { headers: { range: "bytes=-100" } });
    expect(tail.headers.get("content-range")).toBe("bytes 4900-4999/5000");
    expect((await app.request(local(url), { headers: { range: "bytes=9000-" } })).status).toBe(416);
    // O endereço de assistir não serve para enviar outro arquivo por cima.
    expect((await app.request(local(url), { method: "PUT", body: video })).status).toBe(403);

    // Trocar o vídeo apaga o anterior; o endereço antigo para de funcionar.
    const second = await upload(producer.token, { purpose: "lesson_video", filename: "aula 1 nova.mp4", content_type: "video/mp4", lesson_id: lessonId }, video.slice(0, 3000));
    expect(second.done!.body.size_bytes).toBe(3000);
    expect((await app.request(local(url))).status).toBe(404);
    expect((await h.api("DELETE", `/v1/lessons/${lessonId}/video`, { token: producer.token })).status).toBe(200);
    const after = await h.api("GET", `/v1/buyer/products/${product.id}/content`, { token: session });
    expect(after.body.modules[0].lessons[0].video_url).toBeNull();
    const files = await h.system((tx) => tx`select status from files where purpose = 'lesson_video' and account_id = ${producer.accountId} and status <> 'pending'`);
    expect(files.map((f) => f.status)).toEqual(["deleted", "deleted"]);
    expect(BUYER.email).toBeTruthy();
  });
});
