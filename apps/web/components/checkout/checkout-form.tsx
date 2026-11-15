"use client";

import { SANDBOX_CARD_NUMBERS, formatCpf, formatPhone, isValidCpf, isValidEmail, isValidPhone, onlyDigits } from "@domma/core";
import { Check, Clock, Copy, Lock, Mail, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { type OrderResult, type Quote, getQuote, openAccess, orderStatus, placeOrder, saveFields, simulatePix, startSession } from "@/app/c/[slug]/actions";
import { Button, Card, Cover, Field, Money, Notice, Spinner, cx, inputClass } from "@/components/ui";

export interface CheckoutData {
  offer: { id: string; slug: string; name: string; price_cents: number; methods: ("pix" | "card")[] };
  product: { id: string; name: string; description: string; cover_url: string | null; guarantee_days: number; type: string };
  seller: { name: string; support_contact: string | null; verified: boolean };
  bumps: { id: string; title: string; description: string; price_cents: number }[];
  installments: Quote["installments"];
  pix_expires_minutes: number;
  sandbox: boolean;
}

type FieldName = "name" | "email" | "phone" | "cpf";
const EMPTY = { name: "", email: "", phone: "", cpf: "" };

const VALIDATORS: Record<FieldName, (v: string) => string | null> = {
  name: (v) => (v.trim().split(/\s+/).length >= 2 && v.trim().length >= 5 ? null : "Digite o nome completo, como está no seu documento."),
  email: (v) => (isValidEmail(v) ? null : "Confira o e-mail: é por ele que o acesso chega."),
  phone: (v) => (isValidPhone(v) ? null : "Digite o celular com DDD."),
  cpf: (v) => (isValidCpf(v) ? null : "CPF inválido. Confira os números."),
};

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CheckoutForm({ data, slug, utm, apiUrl }: { data: CheckoutData; slug: string; utm: Record<string, string>; apiUrl: string }) {
  const storageKey = `dm-checkout:${slug}`;
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName | "card", string>>>({});
  const [method, setMethod] = useState<"pix" | "card">(data.offer.methods.includes("pix") ? "pix" : "card");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", holder: "" });
  const [installments, setInstallments] = useState(1);
  const [bumpIds, setBumpIds] = useState<string[]>([]);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sessionId = useRef<string | null>(null);
  const idempotencyKey = useRef<string>("");

  // Nunca apagar o que o comprador digitou: o preenchimento fica guardado neste aparelho.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setFields({ ...EMPTY, ...JSON.parse(saved) });
    } catch {}
    startSession(slug, utm).then((r) => {
      if (r.ok) sessionId.current = r.session_id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (name: FieldName, value: string) => {
    const next = { ...fields, [name]: name === "cpf" ? formatCpf(value) : name === "phone" ? formatPhone(value) : value };
    setFields(next);
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const blur = (name: FieldName) => {
    if (!fields[name]) return;
    const error = VALIDATORS[name](fields[name]);
    setErrors((e) => ({ ...e, [name]: error ?? undefined }));
    // Salva a cada campo, para a recuperação de carrinho. O CPF não é enviado antes da compra.
    if (!error && name !== "cpf" && sessionId.current) void saveFields(sessionId.current, { [name]: fields[name] });
  };

  const refreshQuote = useCallback(
    async (bumps: string[], code: string | null) => {
      if (bumps.length === 0 && !code) return setQuote(null);
      const result = await getQuote(slug, bumps, code ?? undefined);
      if (result.ok) setQuote(result);
      return result;
    },
    [slug],
  );

  const toggleBump = (id: string) => {
    const next = bumpIds.includes(id) ? bumpIds.filter((b) => b !== id) : [...bumpIds, id];
    setBumpIds(next);
    void refreshQuote(next, coupon);
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    const result = await getQuote(slug, bumpIds, code);
    if (result.ok) {
      setCoupon(code);
      setQuote(result);
    } else setCouponError(result.error);
  };

  const itemsCents = data.offer.price_cents + data.bumps.filter((b) => bumpIds.includes(b.id)).reduce((a, b) => a + b.price_cents, 0);
  const discountCents = quote?.discount_cents ?? 0;
  const baseTotal = itemsCents - discountCents;
  const options = quote?.installments ?? data.installments;
  const chosen = options.find((o) => o.installments === installments) ?? options[0]!;
  const totalCents = method === "card" ? chosen.total_cents : baseTotal;

  const submit = () => {
    const nextErrors: typeof errors = {};
    for (const name of Object.keys(VALIDATORS) as FieldName[]) {
      const error = VALIDATORS[name](fields[name]);
      if (error) nextErrors[name] = error;
    }
    let cardToken: string | undefined;
    if (method === "card") {
      const number = onlyDigits(card.number);
      if (number.length < 13 || !/^\d{2}\/\d{2}$/.test(card.expiry) || card.cvv.length < 3 || card.holder.trim().length < 3) {
        nextErrors.card = "Confira os dados do cartão: número, validade, código e nome.";
      }
      // Campo do provedor de pagamento: troca o número por um token aqui no navegador.
      // O número do cartão nunca chega aos servidores do Domma Mart.
      cardToken = SANDBOX_CARD_NUMBERS[number] ?? "tok_invalid";
    }
    setErrors(nextErrors);
    setSubmitError(null);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      document.getElementById(first === "card" ? "card-number" : `field-${first}`)?.focus();
      return;
    }
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    startTransition(async () => {
      const result = await placeOrder(
        slug,
        { session_id: sessionId.current ?? undefined, buyer: fields, method, installments: method === "card" ? chosen.installments : 1, card_token: cardToken, bump_ids: bumpIds, coupon_code: coupon ?? undefined, utm },
        idempotencyKey.current,
      );
      idempotencyKey.current = "";
      if (!result.ok) return setSubmitError(result.error);
      if (result.status === "refused") return setSubmitError(result.message ?? "Não conseguimos aprovar o pagamento. Tente outro cartão ou pague com Pix.");
      if (result.status === "paid") {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      }
      setOrder(result);
      window.scrollTo({ top: 0 });
    });
  };

  if (order?.status === "paid") return <Paid order={order} productName={data.product.name} />;
  if (order?.status === "pending" && order.pix) {
    return (
      <PixPayment
        order={order}
        apiUrl={apiUrl}
        sandbox={data.sandbox}
        onPaid={() => {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {}
          setOrder({ ...order, status: "paid" });
        }}
        onBack={() => setOrder(null)}
      />
    );
  }

  const summary = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-base font-bold">Total</span>
        <span className="text-right">
          <Money cents={totalCents} className="text-2xl font-bold" />
          {method === "card" && chosen.installments > 1 && (
            <span className="num block text-xs text-muted">
              {chosen.installments}x de {brl(chosen.installment_cents)}
            </span>
          )}
        </span>
      </div>
      {submitError && (
        <div className="mt-3">
          <Notice tone="bad">{submitError}</Notice>
        </div>
      )}
      <Button size="lg" full className="mt-3" loading={pending} onClick={submit}>
        {method === "pix" ? "Gerar Pix" : "Pagar agora"}
      </Button>
      <p className="mt-2.5 text-center text-xs leading-relaxed text-muted">
        Ao continuar, você concorda com os{" "}
        <Link href="/termos" className="underline">
          termos de compra
        </Link>
        . Dúvidas: {data.seller.support_contact ?? "fale com o produtor"}.
      </p>
    </>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 pt-4 pb-56 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-5 lg:pb-12">
      <div className="space-y-3">
        <Card className="flex items-center gap-3.5 p-4 lg:hidden">
          <Cover src={data.product.cover_url} size={64} />
          <div className="min-w-0">
            <h1 className="text-[17px] leading-snug font-bold">{data.product.name}</h1>
            <Money cents={data.offer.price_cents} className="mt-0.5 block text-lg font-bold" />
            <GuaranteeBadge days={data.product.guarantee_days} />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold">Seus dados</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome completo" error={errors.name}>
              <input id="field-name" className={inputClass} autoComplete="name" placeholder="Como está no seu documento" value={fields.name} aria-invalid={Boolean(errors.name)} onChange={(e) => update("name", e.target.value)} onBlur={() => blur("name")} />
            </Field>
            <Field label="E-mail" error={errors.email}>
              <input id="field-email" className={inputClass} type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com" value={fields.email} aria-invalid={Boolean(errors.email)} onChange={(e) => update("email", e.target.value)} onBlur={() => blur("email")} />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Celular" error={errors.phone}>
              <input id="field-phone" className={inputClass} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(00) 00000-0000" value={fields.phone} aria-invalid={Boolean(errors.phone)} onChange={(e) => update("phone", e.target.value)} onBlur={() => blur("phone")} />
            </Field>
            <Field label="CPF" error={errors.cpf}>
              <input id="field-cpf" className={inputClass} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={fields.cpf} aria-invalid={Boolean(errors.cpf)} onChange={(e) => update("cpf", e.target.value)} onBlur={() => blur("cpf")} />
            </Field>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold">Pagamento</h2>
          <div role="tablist" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2">
            {data.offer.methods.map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={method === m}
                onClick={() => {
                  setMethod(m);
                  setSubmitError(null);
                }}
                className={cx("h-12 rounded-lg border text-sm font-bold transition", method === m ? "border-brand bg-brand-dim text-brand" : "border-line text-paper hover:bg-raised")}
              >
                {m === "pix" ? "Pix" : "Cartão"}
              </button>
            ))}
          </div>

          {method === "pix" ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted">
              <Zap size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
              Aprovação na hora. Seu acesso chega em segundos, por e-mail.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {data.sandbox && (
                <Notice tone="brand">
                  Ambiente de testes: use o cartão <span className="num">4242 4242 4242 4242</span>, com qualquer validade e código. Nenhuma cobrança real é feita.
                </Notice>
              )}
              <Field label="Número do cartão" error={errors.card}>
                <input
                  id="card-number"
                  className={cx(inputClass, "num")}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="0000 0000 0000 0000"
                  value={card.number}
                  aria-invalid={Boolean(errors.card)}
                  onChange={(e) => setCard({ ...card, number: onlyDigits(e.target.value).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ") })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Validade">
                  <input className={cx(inputClass, "num")} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: onlyDigits(e.target.value).slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2") })} />
                </Field>
                <Field label="Código (CVV)">
                  <input className={cx(inputClass, "num")} inputMode="numeric" autoComplete="cc-csc" placeholder="000" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: onlyDigits(e.target.value).slice(0, 4) })} />
                </Field>
              </div>
              <Field label="Nome impresso no cartão">
                <input className={inputClass} autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
              </Field>
              <Field label="Parcelas">
                <select className={cx(inputClass, "num")} value={chosen.installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                  {options.map((o) => (
                    <option key={o.installments} value={o.installments}>
                      {o.installments}x de {brl(o.installment_cents)}
                      {o.installments === 1 ? " (à vista)" : ` — total ${brl(o.total_cents)}`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </Card>

        {data.bumps.map((bump) => {
          const checked = bumpIds.includes(bump.id);
          return (
            <label key={bump.id} className={cx("flex cursor-pointer items-start gap-3 rounded-2xl border border-dashed p-4 transition", checked ? "border-brand bg-brand-dim" : "border-brand/40 bg-graphite")}>
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#FFD600]" checked={checked} onChange={() => toggleBump(bump.id)} />
              <span>
                <span className="block text-sm font-bold">{bump.title}</span>
                <span className="mt-0.5 block text-sm text-muted">
                  {bump.description ? `${bump.description} ` : ""}Adicione ao pedido por mais <span className="num">{brl(bump.price_cents)}</span>.
                </span>
              </span>
            </label>
          );
        })}

        <div className="px-1 lg:hidden">
          <CouponBox open={couponOpen} setOpen={setCouponOpen} input={couponInput} setInput={setCouponInput} applied={coupon} error={couponError} discount={discountCents} onApply={applyCoupon} />
        </div>
      </div>

      {/* Computador: resumo do pedido ao lado */}
      <Card className="sticky top-20 hidden p-5 lg:block">
        <h2 className="mb-4 text-base font-bold">Resumo do pedido</h2>
        <div className="flex items-center gap-3">
          <Cover src={data.product.cover_url} size={56} />
          <div>
            <p className="text-sm leading-snug font-bold">{data.product.name}</p>
            <GuaranteeBadge days={data.product.guarantee_days} />
          </div>
        </div>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <SummaryRow label={data.product.name} cents={data.offer.price_cents} />
          {data.bumps.filter((b) => bumpIds.includes(b.id)).map((b) => <SummaryRow key={b.id} label={b.title} cents={b.price_cents} />)}
          {discountCents > 0 && <SummaryRow label={`Cupom ${coupon}`} cents={-discountCents} />}
          {method === "card" && chosen.total_cents > baseTotal && <SummaryRow label="Juros do parcelamento" cents={chosen.total_cents - baseTotal} />}
        </dl>
        <div className="mt-3">
          <CouponBox open={couponOpen} setOpen={setCouponOpen} input={couponInput} setInput={setCouponInput} applied={coupon} error={couponError} discount={discountCents} onApply={applyCoupon} />
        </div>
        <div className="mt-4 border-t border-line pt-4">{summary}</div>
        <TrustSeal />
      </Card>

      {/* Celular: total e botão sempre visíveis */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto max-w-md">{summary}</div>
      </div>
      <div className="mt-4 lg:hidden">
        <TrustSeal />
      </div>
    </main>
  );
}

function SummaryRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="num shrink-0">{brl(cents)}</dd>
    </div>
  );
}

function GuaranteeBadge({ days }: { days: number }) {
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-ok-dim px-2 py-0.5 text-xs font-bold text-ok">
      <ShieldCheck size={12} aria-hidden /> Garantia de {days} dias
    </span>
  );
}

function TrustSeal() {
  return (
    <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
      <Lock size={12} aria-hidden />
      Pagamento por Domma Mart ·{" "}
      <Link href="/verificar-link" className="underline">
        Este link é verdadeiro?
      </Link>
    </p>
  );
}

function CouponBox(props: { open: boolean; setOpen: (v: boolean) => void; input: string; setInput: (v: string) => void; applied: string | null; error: string | null; discount: number; onApply: () => void }) {
  if (props.applied) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ok">
        <Check size={15} aria-hidden /> Cupom {props.applied} aplicado: {brl(props.discount)} de desconto.
      </p>
    );
  }
  if (!props.open) {
    return (
      <button type="button" className="text-sm font-semibold text-brand underline underline-offset-4" onClick={() => props.setOpen(true)}>
        Tem cupom?
      </button>
    );
  }
  return (
    <div>
      <div className="flex gap-2">
        <input className={cx(inputClass, "h-11 uppercase")} placeholder="Código do cupom" aria-label="Código do cupom" value={props.input} onChange={(e) => props.setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && props.onApply()} autoFocus />
        <Button variant="outline" onClick={props.onApply}>
          Aplicar
        </Button>
      </div>
      {props.error && (
        <p role="alert" className="mt-1.5 text-sm text-bad">
          {props.error}
        </p>
      )}
    </div>
  );
}

// ───────────────────────── C02 — Pagamento por Pix ─────────────────────────

function PixPayment({ order, apiUrl, sandbox, onPaid, onBack }: { order: OrderResult; apiUrl: string; sandbox: boolean; onPaid: () => void; onBack: () => void }) {
  const pix = order.pix!;
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((new Date(pix.expires_at).getTime() - Date.now()) / 1000)));
  const [simulating, setSimulating] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const finish = (status: string) => {
      if (done.current) return;
      if (status === "paid") {
        done.current = true;
        onPaid();
      } else if (status === "expired") {
        done.current = true;
        setExpired(true);
      }
    };
    // Tempo real: o servidor avisa assim que o pagamento é confirmado...
    const source = new EventSource(`${apiUrl}/v1/public/orders/${order.order_id}/events?token=${encodeURIComponent(order.token)}`);
    source.addEventListener("status", (e) => finish((e as MessageEvent).data));
    // ...e, por garantia, a tela também confere sozinha de tempos em tempos.
    const poll = setInterval(async () => {
      const result = await orderStatus(order.order_id, order.token);
      if (result.ok) finish(result.status);
    }, 4000);
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      source.close();
      clearInterval(poll);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.order_id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pix.copy_paste);
    } catch {
      const el = document.getElementById("pix-code") as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const clock = useMemo(() => `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`, [secondsLeft]);
  const isExpired = expired || secondsLeft === 0;

  return (
    <main className="mx-auto max-w-md px-4 pt-6 pb-10">
      <h1 className="text-center text-xl leading-snug font-extrabold">Pague com Pix para liberar seu acesso</h1>
      <Money cents={order.buyer_total_cents} className="mt-1 block text-center text-xl font-bold" />

      <Card className="mt-5 flex flex-col items-center p-5">
        {isExpired ? (
          <div className="py-8 text-center">
            <p className="font-bold">Este código Pix venceu</p>
            <p className="mt-1 text-sm text-muted">Nada foi cobrado. Gere um novo código para pagar.</p>
          </div>
        ) : (
          <>
            <div className="size-56 overflow-hidden rounded-xl bg-white p-2 [&>svg]:size-full" role="img" aria-label="QR code do Pix" dangerouslySetInnerHTML={{ __html: pix.qr_svg }} />
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
              <Clock size={14} aria-hidden /> Este código vale por <span className="num font-bold text-paper">{clock}</span>
            </p>
          </>
        )}
      </Card>

      {isExpired ? (
        <Button size="lg" full className="mt-4" onClick={onBack}>
          Gerar novo Pix
        </Button>
      ) : (
        <>
          <textarea id="pix-code" readOnly value={pix.copy_paste} className="sr-only" tabIndex={-1} aria-hidden />
          <Button size="lg" full className="mt-4" onClick={copy}>
            {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            {copied ? "Código copiado" : "Copiar código Pix"}
          </Button>
          <ol className="mt-5 space-y-1.5 text-sm text-muted">
            <li>1. Abra o aplicativo do seu banco.</li>
            <li>2. Escolha Pix e cole o código (ou leia o QR code).</li>
            <li>3. Confirme o pagamento. Esta tela atualiza sozinha.</li>
          </ol>
          <div className="mt-6" aria-live="polite">
            <Notice tone="wait" icon={<Spinner />}>
              <span className="font-bold">Aguardando pagamento</span>
            </Notice>
          </div>
          {sandbox && (
            <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-center">
              <p className="text-xs text-muted">Ambiente de testes: nenhum Pix real é gerado.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                loading={simulating}
                onClick={async () => {
                  setSimulating(true);
                  await simulatePix(order.order_id, order.token);
                }}
              >
                Simular pagamento do Pix
              </Button>
            </div>
          )}
          <button type="button" className="mx-auto mt-5 block text-sm font-semibold text-brand underline underline-offset-4" onClick={onBack}>
            Trocar forma de pagamento
          </button>
        </>
      )}
    </main>
  );
}

// ───────────────────────── C03 — Compra aprovada ─────────────────────────

function Paid({ order, productName }: { order: OrderResult; productName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-md px-4 pt-10 pb-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-dim text-ok">
        <Check size={28} strokeWidth={3} aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl leading-tight font-extrabold">
        Pagamento aprovado,
        <br />
        {order.buyer_first_name}
      </h1>
      <p className="mt-2 text-muted">Seu acesso a {productName} já está liberado.</p>
      <Button
        size="lg"
        full
        className="mt-6"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await openAccess(order.order_id, order.token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Acessar meu produto
      </Button>
      {error && (
        <div className="mt-3 text-left">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <Card className="mt-4 flex items-start gap-3 p-4 text-left text-sm text-muted">
        <Mail size={18} className="mt-0.5 shrink-0" aria-hidden />
        Também enviamos o link de acesso para o seu e-mail. Não precisa criar senha.
      </Card>
    </main>
  );
}
