"use client";

import { parseBRL } from "@domma/core";
import { Check, ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { type Draft, createAndPublish, generateDraft } from "@/app/painel/actions";
import { Button, ButtonLink, Card, Cover, Field, Money, Notice, StatusBadge, cx, inputClass } from "@/components/ui";
import { CopyButton } from "./copy-button";

const EMPTY: Draft = { name: "", description: "", type: "course", price_cents: 9700, guarantee_days: 7, modules: [], source: "local" };
type Editing = "name" | "description" | "price" | "guarantee" | "content" | null;

/** P04 — Criar produto com IA: descrever, revisar, publicar. */
export function NewProduct({ initialDescription }: { initialDescription: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [description, setDescription] = useState(initialDescription);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ai, setAi] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; status: string; checkout_url: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef("");

  const generate = () => {
    if (description.trim().length < 10) return setError("Conte um pouco mais sobre o produto (pelo menos uma frase).");
    setError(null);
    startTransition(async () => {
      const r = await generateDraft(description);
      if (!r.ok) return setError(r.error);
      setDraft(r);
      setAi(true);
      setEditing(null);
      setStep(2);
    });
  };

  const manual = () => {
    setDraft({ ...EMPTY, description: description.trim() });
    setAi(false);
    setEditing("name");
    setError(null);
    setStep(2);
  };

  const publish = () => {
    if (draft.name.trim().length < 3) {
      setEditing("name");
      return setError("Dê um nome ao produto.");
    }
    setError(null);
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    startTransition(async () => {
      const r = await createAndPublish(draft, ai, idempotencyKey.current);
      if (!r.ok) {
        idempotencyKey.current = "";
        return setError(r.error);
      }
      setResult(r);
      setStep(3);
    });
  };

  const lessonsTotal = draft.modules.reduce((a, m) => a + m.lessons.length, 0);
  const EditLink = ({ field }: { field: Editing }) => (
    <button type="button" className="shrink-0 text-sm font-semibold text-accent underline underline-offset-4" onClick={() => setEditing(editing === field ? null : field)}>
      {editing === field ? "Pronto" : "Editar"}
    </button>
  );

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/painel/produtos" className="flex items-center gap-1 text-lg font-extrabold">
          <ChevronLeft size={20} aria-hidden /> Novo produto
        </Link>
        <span className="text-sm text-muted">Passo {step} de 3</span>
      </div>
      <div className="mb-5 h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
        <div className="h-full bg-brand transition-all" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      {step === 1 && (
        <>
          <Field label="Descreva seu produto" hint="Ex.: um curso em vídeo para quem quer fazer a primeira venda na internet, com 24 aulas gravadas e uma planilha." error={error}>
            <textarea className={cx(inputClass, "h-36 py-3")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} autoFocus />
          </Field>
          <Button full size="lg" className="mt-4" loading={pending} onClick={generate}>
            <Sparkles size={18} aria-hidden /> Preencher com a Domma IA
          </Button>
          <button type="button" className="mx-auto mt-4 block text-sm font-semibold text-muted underline underline-offset-4" onClick={manual}>
            Preencher manualmente
          </button>
          <p className="mt-6 text-center text-xs text-muted">Nada vai ao ar sem a sua aprovação. O envio de arquivos e vídeos entra na tela de conteúdo do produto.</p>
        </>
      )}

      {step === 2 && (
        <>
          {description.trim() && (
            <Card className="mb-3 p-4">
              <p className="text-xs text-muted">Você descreveu</p>
              <p className="mt-1 text-sm">{description}</p>
            </Card>
          )}
          <div className={cx("space-y-2.5 rounded-2xl p-3", ai ? "bg-brand-dim" : "border border-line")}>
            {ai && (
              <div className="flex items-center justify-between px-1">
                <span className="rounded-full border border-brand/30 px-2.5 py-0.5 text-xs font-bold text-accent">{draft.source === "model" ? "Preenchido pela Domma IA" : "Sugestão inicial"}</span>
                <button type="button" className="text-sm font-semibold text-accent" disabled={pending} onClick={generate}>
                  Gerar de novo
                </button>
              </div>
            )}

            <Card className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Cover size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Nome</p>
                    {editing === "name" ? (
                      <input className={cx(inputClass, "mt-1 h-11")} value={draft.name} maxLength={120} autoFocus placeholder="Nome do produto" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    ) : (
                      <p className="font-bold">{draft.name || "Sem nome"}</p>
                    )}
                  </div>
                </div>
                <EditLink field="name" />
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">Descrição</p>
                  {editing === "description" ? (
                    <textarea className={cx(inputClass, "mt-1 h-28 py-2.5")} value={draft.description} maxLength={5000} autoFocus onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                  ) : (
                    <p className="text-sm">{draft.description || "Sem descrição"}</p>
                  )}
                </div>
                <EditLink field="description" />
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-2.5">
              <Card className="p-3.5">
                <p className="text-xs text-muted">{ai ? "Preço sugerido" : "Preço"}</p>
                {editing === "price" ? (
                  <input
                    className={cx(inputClass, "num mt-1 h-11")}
                    inputMode="decimal"
                    autoFocus
                    value={priceInput}
                    aria-label="Preço em reais"
                    onChange={(e) => {
                      setPriceInput(e.target.value);
                      const cents = parseBRL(e.target.value);
                      if (cents && cents >= 100) setDraft({ ...draft, price_cents: cents });
                    }}
                  />
                ) : (
                  <Money cents={draft.price_cents} className="block text-lg font-bold" />
                )}
                <button
                  type="button"
                  className="mt-1 text-sm font-semibold text-accent underline underline-offset-4"
                  onClick={() => {
                    setPriceInput((draft.price_cents / 100).toFixed(2).replace(".", ","));
                    setEditing(editing === "price" ? null : "price");
                  }}
                >
                  {editing === "price" ? "Pronto" : "Editar"}
                </button>
              </Card>
              <Card className="p-3.5">
                <p className="text-xs text-muted">Garantia</p>
                {editing === "guarantee" ? (
                  <select className={cx(inputClass, "mt-1 h-11")} value={draft.guarantee_days} onChange={(e) => setDraft({ ...draft, guarantee_days: Number(e.target.value) })}>
                    {[7, 15, 30].map((d) => (
                      <option key={d} value={d}>
                        {d} dias
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-lg font-bold">{draft.guarantee_days} dias</p>
                )}
                <button type="button" className="mt-1 text-sm font-semibold text-accent underline underline-offset-4" onClick={() => setEditing(editing === "guarantee" ? null : "guarantee")}>
                  {editing === "guarantee" ? "Pronto" : "Editar"}
                </button>
              </Card>
            </div>

            {(draft.modules.length > 0 || draft.type === "course") && (
              <Card className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted">
                    Conteúdo · {draft.modules.length} {draft.modules.length === 1 ? "módulo" : "módulos"}, {lessonsTotal} {lessonsTotal === 1 ? "aula" : "aulas"}
                  </p>
                  <EditLink field="content" />
                </div>
                <ol className="mt-2 space-y-1.5 text-sm">
                  {draft.modules.map((m, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-muted">{i + 1}.</span>
                      {editing === "content" ? (
                        <>
                          <input className={cx(inputClass, "h-10 text-sm")} value={m.title} aria-label={`Título do módulo ${i + 1}`} onChange={(e) => setDraft({ ...draft, modules: draft.modules.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                          <button type="button" className="shrink-0 text-xs font-semibold text-bad" onClick={() => setDraft({ ...draft, modules: draft.modules.filter((_, j) => j !== i) })}>
                            Remover
                          </button>
                        </>
                      ) : (
                        <span>
                          {m.title} <span className="text-muted">· {m.lessons.length} {m.lessons.length === 1 ? "aula" : "aulas"}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {editing === "content" && (
                  <button type="button" className="mt-2 text-sm font-semibold text-accent" onClick={() => setDraft({ ...draft, modules: [...draft.modules, { title: `Módulo ${draft.modules.length + 1}`, lessons: [{ title: "Aula 1" }] }] })}>
                    + Adicionar módulo
                  </button>
                )}
                {draft.modules.length === 0 && editing !== "content" && <p className="mt-1 text-sm text-muted">Você monta os módulos e aulas depois de publicar.</p>}
              </Card>
            )}

            <Card className="p-3.5">
              <p className="text-xs text-muted">Checkout</p>
              <p className="text-sm">Pix e cartão em até 12x, prontos para vender</p>
            </Card>
          </div>

          {error && (
            <div className="mt-3">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}
          <Button full size="lg" className="mt-4" loading={pending} onClick={publish}>
            Publicar produto
          </Button>
          <p className="mt-2.5 text-center text-xs text-muted">Nada vai ao ar sem a sua aprovação. Você pode editar tudo depois.</p>
          <button type="button" className="mx-auto mt-3 block text-sm font-semibold text-muted underline underline-offset-4" onClick={() => setStep(1)}>
            Voltar
          </button>
        </>
      )}

      {step === 3 && result && (
        <div className="text-center">
          <span className={cx("mx-auto grid size-14 place-items-center rounded-full", result.status === "approved" ? "bg-ok-dim text-ok" : "bg-wait-dim text-wait")}>
            <Check size={28} strokeWidth={3} aria-hidden />
          </span>
          {result.status === "approved" ? (
            <>
              <h1 className="mt-4 text-2xl font-extrabold">Seu produto já pode vender</h1>
              <p className="mt-2 text-muted">Passou na análise automática. Copie o link do checkout e divulgue.</p>
              <Card className="mt-5 p-4 text-left">
                <p className="text-xs text-muted">Link do checkout</p>
                <p className="num mt-1 text-sm break-all">{result.checkout_url}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <CopyButton text={result.checkout_url} variant="primary" full />
                  <a href={result.checkout_url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold hover:bg-raised">
                    Ver o checkout
                  </a>
                </div>
              </Card>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-extrabold">Produto enviado para análise</h1>
              <div className="mt-3 flex justify-center">
                <StatusBadge status="in_review" />
              </div>
              <p className="mt-3 text-muted">Uma pessoa da nossa equipe vai olhar este produto antes de ele ir ao ar. A resposta chega por e-mail em até 5 dias úteis, com o motivo se algo precisar de ajuste.</p>
            </>
          )}
          <ButtonLink href={`/painel/produtos/${result.id}`} variant="outline" full className="mt-4">
            Abrir o produto
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
