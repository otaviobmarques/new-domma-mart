import { Check, Clock, FileText, Lock, RotateCcw, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Logotipo Domma com a onda em amarelo e MART no lugar de TECNOLOGIA. */
export function Logo({ size = 28, tag }: { size?: number; tag?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="Domma Mart">
      <svg width={size * 1.5} height={size} viewBox="0 0 48 32" fill="none" aria-hidden>
        <path d="M5 23C5 7 17 7 17 17c0 13 14 13 14 0 0-10 12-10 12 6" stroke="#FFD600" strokeWidth="5" strokeLinecap="round" />
        <circle cx="24" cy="5" r="3" fill="currentColor" className="text-paper" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-extrabold tracking-tight text-paper" style={{ fontSize: size * 0.82 }}>
          Domma
        </span>
        <span className="font-bold text-accent" style={{ fontSize: size * 0.3, letterSpacing: "0.32em", marginTop: 2 }}>
          MART
        </span>
      </span>
      {tag && <span className="ml-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-onbrand">{tag}</span>}
    </span>
  );
}

const buttonStyles = {
  primary: "bg-brand text-onbrand font-bold hover:brightness-95",
  outline: "border border-line bg-transparent text-paper font-semibold hover:bg-raised",
  brandOutline: "border border-brand text-accent font-bold hover:bg-brand-dim",
  danger: "border border-bad/50 text-bad font-semibold hover:bg-bad-dim",
  ghost: "text-muted font-semibold hover:text-paper",
};
const buttonSizes = { lg: "h-13 px-5 text-base rounded-xl", md: "h-11 px-4 text-sm rounded-lg", sm: "h-9 px-3 text-sm rounded-lg" };

type ButtonProps = { variant?: keyof typeof buttonStyles; size?: keyof typeof buttonSizes; full?: boolean; loading?: boolean };

export function buttonClass({ variant = "primary", size = "md", full }: ButtonProps = {}) {
  return cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
    buttonStyles[variant],
    buttonSizes[size],
    full && "w-full",
  );
}

export function Button({ variant, size, full, loading, children, className, disabled, ...props }: ButtonProps & ComponentProps<"button">) {
  return (
    <button {...props} disabled={disabled || loading} className={cx(buttonClass({ variant, size, full }), className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, full, className, ...props }: ButtonProps & ComponentProps<typeof Link>) {
  return <Link {...props} className={cx(buttonClass({ variant, size, full }), className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("spin inline-block size-4 rounded-full border-2 border-current border-t-transparent", className)} aria-hidden />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("rounded-2xl border border-line bg-graphite", className)} />;
}

export const inputClass =
  "h-12 w-full rounded-lg border border-line bg-ink px-3.5 text-base text-paper outline-none transition focus:border-brand aria-[invalid=true]:border-bad";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-paper">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm text-bad">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>
      )}
    </label>
  );
}

export function Notice({ tone = "ok", children, icon }: { tone?: "ok" | "wait" | "bad" | "brand"; children: ReactNode; icon?: ReactNode }) {
  const tones = {
    ok: "bg-ok-dim text-ok border-ok/20",
    wait: "bg-wait-dim text-wait border-wait/20",
    bad: "bg-bad-dim text-bad border-bad/30",
    brand: "bg-brand-dim text-accent border-brand/20",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-snug", tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

/** Estados sempre com cor + palavra + ícone (item 1.3). */
const STATUS: Record<string, { label: string; tone: "ok" | "wait" | "bad" | "neutral"; icon: typeof Check }> = {
  paid: { label: "Aprovada", tone: "ok", icon: Check },
  pending: { label: "Aguardando", tone: "wait", icon: Clock },
  refused: { label: "Recusada", tone: "bad", icon: X },
  expired: { label: "Vencida", tone: "neutral", icon: Clock },
  refunded: { label: "Reembolsada", tone: "neutral", icon: RotateCcw },
  chargeback: { label: "Contestada", tone: "bad", icon: ShieldAlert },
  approved: { label: "Aprovado", tone: "ok", icon: Check },
  in_review: { label: "Em análise", tone: "wait", icon: Clock },
  draft: { label: "Rascunho", tone: "neutral", icon: FileText },
  paused: { label: "Pausado", tone: "neutral", icon: Clock },
  blocked: { label: "Bloqueado", tone: "bad", icon: Lock },
  completed: { label: "Concluído", tone: "ok", icon: Check },
  processing: { label: "Em andamento", tone: "wait", icon: Clock },
  failed: { label: "Não concluído", tone: "bad", icon: X },
  none: { label: "Pendente", tone: "neutral", icon: Clock },
  delivered: { label: "Entregue", tone: "ok", icon: Check },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const, icon: Clock };
  const tones = { ok: "bg-ok-dim text-ok", wait: "bg-wait-dim text-wait", bad: "bg-bad-dim text-bad", neutral: "bg-raised text-paper border border-line" };
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold whitespace-nowrap", tones[s.tone])}>
      <Icon size={12} strokeWidth={3} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function Cover({ src, size = 56, label = "Capa" }: { src?: string | null; size?: number; label?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-lg bg-brand-dim text-[11px] font-bold text-accent" style={{ width: size, height: size }} aria-hidden>
      {label}
    </span>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  const formatted = (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return <span className={cx("num", className)}>{formatted}</span>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="px-5 py-10 text-center">
      <p className="font-bold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-sm text-muted">{children}</div>}
    </Card>
  );
}
