"use client";

import { ACCENT_LABEL, ACCENT_SWATCH, CHECKOUT_ACCENTS, COUNTDOWN_OPTIONS, type CheckoutConfig } from "@domma/core";
import { Check, ChevronLeft, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { saveCheckout } from "@/app/painel/actions";
import { Button, Card, Field, Notice, cx, inputClass } from "@/components/ui";

const isHttps = (v: string) => /^https:\/\/[^\s"'<>]+$/i.test(v);

/** P06 — Editor de checkout: o produtor mexe no painel e vê o checkout de verdade mudar na hora. */
export function CheckoutEditor({ productId, productName, offerId, offerName, initial, hasDraft, published }: { productId: string; productName: string; offerId: string; offerName: string; initial: CheckoutConfig; hasDraft: boolean; published: boolean }) {
  const [config, setConfig] = useState(initial);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState(hasDraft);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const frame = useRef<HTMLIFrameElement>(null);
  const frameBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const send = useCallback((next: CheckoutConfig) => {
    frame.current?.contentWindow?.postMessage({ type: "dm-checkout-config", config: next }, window.location.origin);
  }, []);

  // A pré-visualização avisa quando terminou de carregar; aí mandamos o estado atual.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "dm-checkout-preview-ready") send(config);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [config, send]);

  // No modo computador o checkout é desenhado em 1180 px e reduzido para caber.
  useEffect(() => {
    const box = frameBox.current;
    if (!box) return;
    const update = () => setScale(device === "desktop" ? Math.min(1, (box.clientWidth - 24) / 1180) : 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [device]);

  const change = (patch: Partial<CheckoutConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setDirty(true);
    setMessage(null);
    send(next);
  };

  const urlError = (v: string | null) => (v && !isHttps(v) ? "Use um endereço que comece com https://" : null);
  const invalid = Boolean(urlError(config.logo_url) || urlError(config.banner_url));

  const save = (publish: boolean) => {
    if (invalid) return setMessage({ tone: "bad", text: "Corrija os endereços de imagem antes de salvar." });
    const clean = { ...config, logo_url: config.logo_url || null, banner_url: config.banner_url || null, testimonials: config.testimonials.filter((t) => t.name.trim() && t.text.trim()) };
    startTransition(async () => {
      const r = await saveCheckout(offerId, productId, clean, publish);
      if (!r.ok) return setMessage({ tone: "bad", text: r.error });
      setDirty(false);
      setDraft(!publish);
      setMessage({ tone: "ok", text: publish ? "Publicado. Seu checkout já está com a nova aparência." : "Rascunho salvo. Só vai ao ar quando você publicar." });
    });
  };

  const setTestimonial = (i: number, patch: Partial<{ name: string; text: string }>) => change({ testimonials: config.testimonials.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={`/painel/produtos/${productId}`} className="flex items-center gap-1 text-lg font-extrabold">
            <ChevronLeft size={20} aria-hidden /> Editor de checkout
          </Link>
          <p className="mt-0.5 pl-6 text-sm text-muted">
            {productName} · {offerName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(dirty || draft) && <span className="text-xs font-semibold text-wait">{dirty ? "Alterações não salvas" : "Rascunho ainda não publicado"}</span>}
          <Button variant="outline" loading={pending} disabled={!dirty} onClick={() => save(false)}>
            Salvar rascunho
          </Button>
          <Button loading={pending} disabled={!dirty && !draft} onClick={() => save(true)}>
            Publicar
          </Button>
        </div>
      </div>
      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      {!published && (
        <div className="mb-4">
          <Notice tone="wait">Este produto ainda não está aprovado, então o checkout não está no ar. Você pode deixar a aparência pronta desde já.</Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        <div className="space-y-3">
          <Card className="space-y-4 p-4">
            <h2 className="font-bold">Marca</h2>
            <Field label="Endereço do logo" hint="Imagem em https://. O envio de arquivo entra junto com o armazenamento de arquivos." error={urlError(config.logo_url)}>
              <input className={cx(inputClass, "h-11 text-sm")} inputMode="url" placeholder="https://..." value={config.logo_url ?? ""} onChange={(e) => change({ logo_url: e.target.value.trim() || null })} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Cor principal</legend>
              <div className="flex flex-wrap gap-2.5">
                {CHECKOUT_ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    title={ACCENT_LABEL[accent]}
                    aria-label={ACCENT_LABEL[accent]}
                    aria-pressed={config.accent === accent}
                    onClick={() => change({ accent })}
                    className={cx("grid size-9 place-items-center rounded-full border-2 transition", config.accent === accent ? "border-paper" : "border-line hover:border-muted")}
                    style={{ background: ACCENT_SWATCH[accent] }}
                  >
                    {config.accent === accent && <Check size={16} strokeWidth={3} color="#0b0b0c" aria-hidden />}
                  </button>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card className="space-y-4 p-4">
            <h2 className="font-bold">O que aparece</h2>
            <Field label="Banner no topo" hint="Endereço de uma imagem em https://. Deixe vazio para não mostrar." error={urlError(config.banner_url)}>
              <input className={cx(inputClass, "h-11 text-sm")} inputMode="url" placeholder="https://..." value={config.banner_url ?? ""} onChange={(e) => change({ banner_url: e.target.value.trim() || null })} />
            </Field>
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={config.show_guarantee} onChange={(e) => change({ show_guarantee: e.target.checked })} />
              Selo de garantia
            </label>
            <Field label="Contador de tempo" hint="Lembrete visual no topo. Ele recomeça ao chegar a zero e não muda o preço.">
              <select className={cx(inputClass, "h-11 text-sm")} value={config.countdown_minutes} onChange={(e) => change({ countdown_minutes: Number(e.target.value) })}>
                {COUNTDOWN_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "Sem contador" : `${m} minutos`}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Texto do botão</h2>
            <Field label="O que o comprador lê" hint={`${config.button_text.length}/40 · vazio usa “Gerar Pix” e “Pagar agora”.`}>
              <input className={cx(inputClass, "h-11 text-sm")} maxLength={40} placeholder="Quero garantir minha vaga" value={config.button_text} onChange={(e) => change({ button_text: e.target.value })} />
            </Field>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-bold">Depoimentos</h2>
            <p className="text-sm text-muted">Até 3. Use só depoimentos reais, de quem comprou e autorizou.</p>
            {config.testimonials.map((t, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                <input className={cx(inputClass, "h-10 text-sm")} placeholder="Nome" aria-label={`Nome do depoimento ${i + 1}`} maxLength={60} value={t.name} onChange={(e) => setTestimonial(i, { name: e.target.value })} />
                <textarea className={cx(inputClass, "h-20 py-2 text-sm")} placeholder="O que a pessoa disse" aria-label={`Texto do depoimento ${i + 1}`} maxLength={280} value={t.text} onChange={(e) => setTestimonial(i, { text: e.target.value })} />
                <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-bad" onClick={() => change({ testimonials: config.testimonials.filter((_, j) => j !== i) })}>
                  <Trash2 size={13} aria-hidden /> Remover
                </button>
              </div>
            ))}
            {config.testimonials.length < 3 && (
              <button type="button" className="flex items-center gap-1.5 text-sm font-semibold text-accent" onClick={() => change({ testimonials: [...config.testimonials, { name: "", text: "" }] })}>
                <Plus size={15} aria-hidden /> Adicionar depoimento
              </button>
            )}
          </Card>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          <div className="mb-3 flex justify-center gap-2" role="group" aria-label="Tamanho da pré-visualização">
            {(
              [
                ["mobile", "Celular", Smartphone],
                ["desktop", "Computador", Monitor],
              ] as const
            ).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)} className={cx("flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold", device === value ? "border-brand bg-brand-dim text-accent" : "border-line hover:bg-raised")}>
                <Icon size={16} aria-hidden /> {label}
              </button>
            ))}
          </div>
          {/* O iframe fica solto dentro da moldura para o tamanho dele não empurrar a página. */}
          <div ref={frameBox} className="relative overflow-hidden rounded-2xl border border-line bg-ink" style={{ height: device === "mobile" ? 720 : Math.round(760 * scale) + 24 }}>
            <iframe
              ref={frame}
              title="Pré-visualização do checkout"
              src={`/previa-checkout/${offerId}?produto=${productId}`}
              className={cx("absolute top-3 left-1/2 border border-line bg-ink", device === "mobile" ? "rounded-[1.75rem]" : "rounded-xl")}
              style={
                device === "mobile"
                  ? { width: 380, maxWidth: "calc(100% - 24px)", height: 694, transform: "translateX(-50%)" }
                  : { width: 1180, height: 760, transformOrigin: "top center", transform: `translateX(-50%) scale(${scale})` }
              }
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted">A pré-visualização muda na hora. Os campos obrigatórios e os avisos do rodapé não podem ser removidos.</p>
        </div>
      </div>
    </div>
  );
}
