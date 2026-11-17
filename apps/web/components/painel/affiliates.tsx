"use client";

import { formatBRL } from "@domma/core";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { type AffiliateProgram, decideAffiliation, endCoproduction, inviteCoproducer, joinAffiliateProgram, respondCoproduction, saveAffiliateProgram, setAffiliateCommission } from "@/app/painel/actions";
import { Button, Notice, cx, inputClass } from "@/components/ui";

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const parseMoney = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);
const isHttps = (v: string) => /^https:\/\/[^\s"'<>]+$/i.test(v);
type Msg = { tone: "ok" | "bad"; text: string } | null;

export function AffiliateTabs() {
  const path = usePathname();
  const tabs = [
    { href: "/painel/afiliados", label: "Quem divulga meus produtos" },
    { href: "/painel/afiliados/divulgar", label: "Divulgar e ganhar comissão" },
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line text-sm font-semibold" aria-label="Afiliados">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2.5 whitespace-nowrap", path === t.href ? "border-brand text-paper" : "border-transparent text-muted hover:text-paper")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const MODES: { value: AffiliateProgram["mode"]; label: string; hint: string }[] = [
  { value: "closed", label: "Desligado", hint: "Ninguém pode se afiliar." },
  { value: "open", label: "Aberto", hint: "Quem quiser divulgar recebe o link na hora." },
  { value: "approval", label: "Com aprovação", hint: "Você aprova cada pessoa antes de liberar o link." },
];

/** Programa de afiliados de um produto: ligar, definir a comissão e as regras. Vale para vendas futuras. */
export function ProgramForm({ productId, priceCents, initial }: { productId: string; priceCents: number | null; initial: AffiliateProgram }) {
  const [p, setP] = useState(initial);
  const [percent, setPercent] = useState(String(initial.commission_bps / 100).replace(".", ","));
  const [fixed, setFixed] = useState((initial.commission_cents / 100).toFixed(2).replace(".", ","));
  const [more, setMore] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const on = p.mode !== "closed";
  const bps = Math.round(Number(percent.replace(",", ".")) * 100);
  const cents = parseMoney(fixed);
  const example = priceCents ? (p.commission_type === "percent" ? Math.floor((priceCents * (bps || 0)) / 10_000) : cents || 0) : null;

  const save = () => {
    if (on && p.commission_type === "percent" && !(bps >= 100 && bps <= 9000)) return setMessage({ tone: "bad", text: "A comissão precisa ficar entre 1% e 90%." });
    if (on && p.commission_type === "fixed" && !(cents >= 100)) return setMessage({ tone: "bad", text: "A comissão precisa ser de pelo menos R$ 1,00." });
    const materials = p.materials.filter((m) => m.title.trim() || m.url.trim());
    if (materials.some((m) => !m.title.trim() || !isHttps(m.url))) return setMessage({ tone: "bad", text: "Cada material precisa de um nome e de um endereço que comece com https://" });
    startTransition(async () => {
      const r = await saveAffiliateProgram(productId, { ...p, commission_bps: Number.isFinite(bps) ? Math.max(0, Math.min(9000, bps)) : 0, commission_cents: Number.isFinite(cents) ? Math.max(0, cents) : 0, materials });
      setMessage(r.ok ? { tone: "ok", text: "Programa salvo. Vale para as próximas vendas." } : { tone: "bad", text: r.error });
    });
  };

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Programa de afiliados</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.value} className={cx("cursor-pointer rounded-xl border p-3 text-sm", p.mode === m.value ? "border-brand bg-brand-dim" : "border-line hover:bg-raised")}>
              <input type="radio" name={`mode-${productId}`} className="sr-only" checked={p.mode === m.value} onChange={() => setP({ ...p, mode: m.value })} />
              <span className="block font-bold">{m.label}</span>
              <span className="block text-xs text-muted">{m.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {on && (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold">Comissão por venda</p>
            <div className="flex flex-wrap items-center gap-2">
              <select className={cx(inputClass, "h-11 !w-auto")} value={p.commission_type} onChange={(e) => setP({ ...p, commission_type: e.target.value as AffiliateProgram["commission_type"] })} aria-label="Tipo de comissão">
                <option value="percent">Percentual</option>
                <option value="fixed">Valor fixo</option>
              </select>
              {p.commission_type === "percent" ? (
                <span className="flex items-center gap-1.5">
                  <input className={cx(inputClass, "num h-11 w-24")} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Percentual da comissão" /> %
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  R$ <input className={cx(inputClass, "num h-11 w-28")} inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} aria-label="Valor da comissão" />
                </span>
              )}
            </div>
            {example != null && priceCents && (
              <p className="mt-1.5 text-xs text-muted">
                Em uma venda de {formatBRL(priceCents)}, o afiliado recebe {formatBRL(Math.min(example, priceCents))}. A comissão sai da sua parte, depois da taxa.
              </p>
            )}
          </div>

          <button type="button" className="block text-sm font-semibold text-accent" onClick={() => setMore(!more)}>
            {more ? "Ocultar opções avançadas" : "Opções avançadas e materiais de divulgação"}
          </button>
          {more && (
            <div className="space-y-4 rounded-xl border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  Se a pessoa passou por dois links, quem leva?
                  <select className={cx(inputClass, "mt-1.5 h-11")} value={p.attribution} onChange={(e) => setP({ ...p, attribution: e.target.value as AffiliateProgram["attribution"] })}>
                    <option value="last">O último link</option>
                    <option value="first">O primeiro link</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Por quantos dias o link vale depois do clique
                  <input className={cx(inputClass, "num mt-1.5 h-11")} inputMode="numeric" value={p.cookie_days} onChange={(e) => setP({ ...p, cookie_days: Math.max(1, Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
                </label>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Materiais de divulgação</legend>
                <div className="space-y-2">
                  {p.materials.map((m, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input className={cx(inputClass, "h-10 text-sm sm:w-44")} placeholder="Nome (ex.: Banner)" aria-label={`Nome do material ${i + 1}`} value={m.title} maxLength={120} onChange={(e) => setP({ ...p, materials: p.materials.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      <input className={cx(inputClass, "h-10 min-w-0 flex-1 text-sm")} placeholder="https://..." aria-label={`Endereço do material ${i + 1}`} inputMode="url" value={m.url} onChange={(e) => setP({ ...p, materials: p.materials.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)) })} />
                      <button type="button" className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-bad" aria-label={`Remover material ${i + 1}`} onClick={() => setP({ ...p, materials: p.materials.filter((_, j) => j !== i) })}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                {p.materials.length < 20 && (
                  <button type="button" className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-accent" onClick={() => setP({ ...p, materials: [...p.materials, { title: "", url: "" }] })}>
                    <Plus size={15} aria-hidden /> Adicionar material
                  </button>
                )}
              </fieldset>
            </div>
          )}
        </>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button loading={pending} onClick={save}>
        Salvar programa
      </Button>
    </div>
  );
}

/** Ações do produtor sobre um afiliado: aprovar, recusar, bloquear, reativar e dar uma comissão própria. */
export function AffiliateActions({ id, status, ownCommission }: { id: string; status: string; ownCommission: string | null }) {
  const [editing, setEditing] = useState(false);
  const [percent, setPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Não deu certo."));
      if (r.ok) setEditing(false);
    });
  return (
    <div className="mt-2">
      {error && <p className="mb-1.5 text-sm text-bad">{error}</p>}
      {editing ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input className={cx(inputClass, "num h-9 w-20 px-2 text-sm")} inputMode="decimal" placeholder="35" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Comissão própria em percentual" /> %
          <Button
            size="sm"
            loading={pending}
            onClick={() => {
              const bps = Math.round(Number(percent.replace(",", ".")) * 100);
              if (!(bps >= 100 && bps <= 9000)) return setError("Use um percentual entre 1 e 90.");
              run(() => setAffiliateCommission(id, { commission_type: "percent", commission_bps: bps }));
            }}
          >
            Salvar
          </Button>
          {ownCommission && (
            <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => setAffiliateCommission(id, { commission_type: null }))}>
              Voltar para a do programa
            </Button>
          )}
          <button type="button" className="text-xs font-semibold text-muted" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "pending" && (
            <>
              <Button size="sm" loading={pending} onClick={() => run(() => decideAffiliation(id, "approve"))}>
                Aprovar
              </Button>
              <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => decideAffiliation(id, "reject"))}>
                Recusar
              </Button>
            </>
          )}
          {status === "approved" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {ownCommission ? `Comissão própria: ${ownCommission}` : "Comissão própria"}
              </Button>
              <Button size="sm" variant="outline" loading={pending} onClick={() => window.confirm("Bloquear este afiliado? O link dele para de valer comissão.") && run(() => decideAffiliation(id, "block"))}>
                Bloquear
              </Button>
            </>
          )}
          {(status === "blocked" || status === "rejected") && (
            <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => decideAffiliation(id, "approve"))}>
              {status === "blocked" ? "Reativar" : "Aprovar mesmo assim"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Convidar um coprodutor: a divisão só começa depois que a pessoa aceitar. */
export function CoproducerForm({ productId }: { productId: string }) {
  const [email, setEmail] = useState("");
  const [percent, setPercent] = useState("");
  const [until, setUntil] = useState("");
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[1fr_90px_150px_auto] sm:items-end">
        <label className="block min-w-0 text-xs font-semibold text-muted">
          E-mail da conta do coprodutor
          <input className={cx(inputClass, "mt-1 h-10 text-sm")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parceiro@email.com" />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Parte (%)
          <input className={cx(inputClass, "num mt-1 h-10 text-sm")} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="30" />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Até quando (opcional)
          <input className={cx(inputClass, "mt-1 h-10 text-sm")} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <Button
          size="sm"
          className="h-10"
          loading={pending}
          onClick={() => {
            const bps = Math.round(Number(percent.replace(",", ".")) * 100);
            if (!email.includes("@")) return setMessage({ tone: "bad", text: "Digite o e-mail da conta do coprodutor." });
            if (!(bps >= 100 && bps <= 9000)) return setMessage({ tone: "bad", text: "A parte precisa ficar entre 1% e 90%." });
            startTransition(async () => {
              const r = await inviteCoproducer(productId, email.trim(), bps, until ? new Date(`${until}T23:59:59-03:00`).toISOString() : null);
              if (r.ok) {
                setEmail("");
                setPercent("");
                setUntil("");
              }
              setMessage(r.ok ? { tone: "ok", text: "Convite enviado. A divisão começa quando a pessoa aceitar." } : { tone: "bad", text: r.error });
            });
          }}
        >
          Convidar
        </Button>
      </div>
      {message && (
        <div className="mt-2">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
    </div>
  );
}

export function EndCoproduction({ id, invited }: { id: string; invited: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs font-semibold text-muted underline underline-offset-4 hover:text-bad"
      onClick={() => window.confirm(invited ? "Cancelar este convite?" : "Encerrar a coprodução? As próximas vendas deixam de ser divididas; as já feitas não mudam.") && startTransition(async () => void (await endCoproduction(id)))}
    >
      {invited ? "Cancelar convite" : "Encerrar"}
    </button>
  );
}

/** Botão único do portal: "Divulgar". */
export function JoinButton({ productId, mode }: { productId: string; mode: string }) {
  const [state, setState] = useState<"idle" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (state === "sent") return <span className="rounded-lg bg-wait-dim px-3 py-2 text-sm font-semibold text-wait">Pedido enviado</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await joinAffiliateProgram(productId);
            if (!r.ok) return setError(r.error);
            if (mode === "approval") setState("sent");
          })
        }
      >
        Divulgar
      </Button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

export function CoproductionInvite({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (accept: boolean) =>
    startTransition(async () => {
      const r = await respondCoproduction(id, accept);
      setError(r.ok ? null : r.error);
    });
  return (
    <div className="mt-2">
      {error && <p className="mb-1.5 text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => run(true)}>
          Aceitar
        </Button>
        <Button size="sm" variant="outline" loading={pending} onClick={() => run(false)}>
          Recusar
        </Button>
      </div>
    </div>
  );
}
