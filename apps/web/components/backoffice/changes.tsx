"use client";

import { useState, useTransition } from "react";
import { decideChange, requestChange } from "@/app/backoffice/actions";
import { Button, Notice, inputClass } from "@/components/ui";

type Kind = "percent" | "money" | "int";
interface FieldDef {
  key: string;
  label: string;
  kind: Kind;
  suffix?: string;
  /** Valor atual, na unidade guardada (pontos-base, centavos ou inteiro). null = vazio. */
  value: number | null;
  optional?: boolean;
}

const show = (kind: Kind, v: number | null) => (v == null ? "" : kind === "int" ? String(v) : (v / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function parse(kind: Kind, text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return kind === "int" ? (Number.isInteger(n) ? n : undefined) : Math.round(n * 100);
}

/** Formulário de alteração: só o que mudou é enviado, sempre com motivo, e outra pessoa aprova. */
function ChangeForm({ fields, build, submitLabel, extra }: { fields: FieldDef[]; build: (changed: Record<string, number | null>) => Parameters<typeof requestChange>[0] | string; submitLabel: string; extra?: React.ReactNode }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, show(f.kind, f.value)])));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const changed: Record<string, number | null> = {};
    for (const f of fields) {
      const v = parse(f.kind, values[f.key] ?? "");
      if (v === undefined || (v === null && !f.optional)) return setMessage({ tone: "bad", text: `Confira o campo "${f.label}".` });
      if (v !== f.value) changed[f.key] = v;
    }
    if (Object.keys(changed).length === 0) return setMessage({ tone: "bad", text: "Nenhum valor foi alterado." });
    if (reason.trim().length < 5) return setMessage({ tone: "bad", text: "Escreva o motivo da alteração." });
    const input = build(changed);
    if (typeof input === "string") return setMessage({ tone: "bad", text: input });
    startTransition(async () => {
      const r = await requestChange({ ...input, reason });
      if (r.ok) setReason("");
      setMessage(r.ok ? { tone: "ok", text: "Pedido registrado. Ele passa a valer quando outra pessoa da equipe aprovar." } : { tone: "bad", text: r.error });
    });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.key} className="block min-w-0 text-xs font-semibold text-muted">
            {f.label}
            <span className="mt-1 flex items-center gap-1.5">
              <input
                className={`${inputClass} num h-10 min-w-0 px-2.5 text-sm`}
                inputMode="decimal"
                value={values[f.key] ?? ""}
                placeholder={f.optional ? "sem limite" : ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              <span className="shrink-0 text-xs">{f.suffix ?? (f.kind === "percent" ? "%" : f.kind === "money" ? "R$" : "")}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="mt-3 block text-sm font-semibold">
        Motivo (fica registrado)
        <textarea className={`${inputClass} mt-1.5 h-16 py-2 text-sm`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {message && (
        <div className="mt-2">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button loading={pending} onClick={submit}>
          {submitLabel}
        </Button>
        {extra}
      </div>
    </div>
  );
}

export interface ConditionsNow {
  cardPercentBps: number;
  cardFixedCents: number;
  pixFixedCents: number;
  pixReleaseDays: number;
  cardReleaseDays: number;
  reserveBps: number;
  reserveDays: number;
  dailyLimitCents: number | null;
}

/** B03 — Condições próprias de uma conta (taxas, prazos, reserva e limite de saque). */
export function ConditionsForm({ accountId, now, hasOverride }: { accountId: string; now: ConditionsNow; hasOverride: boolean }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const fields: FieldDef[] = [
    { key: "cardPercentBps", label: "Taxa do cartão", kind: "percent", value: now.cardPercentBps },
    { key: "cardFixedCents", label: "Fixo do cartão", kind: "money", value: now.cardFixedCents },
    { key: "pixFixedCents", label: "Fixo do Pix", kind: "money", value: now.pixFixedCents },
    { key: "dailyLimitCents", label: "Limite de saque por dia", kind: "money", value: now.dailyLimitCents, optional: true },
    { key: "pixReleaseDays", label: "Liberação do Pix", kind: "int", suffix: "dias", value: now.pixReleaseDays },
    { key: "cardReleaseDays", label: "Liberação do cartão", kind: "int", suffix: "dias", value: now.cardReleaseDays },
    { key: "reserveBps", label: "Reserva de segurança", kind: "percent", value: now.reserveBps },
    { key: "reserveDays", label: "Reserva devolvida em", kind: "int", suffix: "dias", value: now.reserveDays },
  ];
  return (
    <ChangeForm
      fields={fields}
      submitLabel="Pedir alteração"
      build={(c) => {
        const payload: Record<string, unknown> = {};
        const card = { ...("cardPercentBps" in c ? { percentBps: c.cardPercentBps } : {}), ...("cardFixedCents" in c ? { fixedCents: c.cardFixedCents } : {}) };
        const fee = { ...(Object.keys(card).length ? { card } : {}), ...("pixFixedCents" in c ? { pix: { fixedCents: c.pixFixedCents } } : {}) };
        if (Object.keys(fee).length) payload.fee_override = fee;
        const releaseKeys = ["pixReleaseDays", "cardReleaseDays", "reserveBps", "reserveDays"].filter((k) => k in c);
        if (releaseKeys.length) payload.release_override = Object.fromEntries(releaseKeys.map((k) => [k, c[k]]));
        if ("dailyLimitCents" in c) payload.withdrawal_daily_limit_cents = c.dailyLimitCents;
        return { kind: "account_conditions", account_id: accountId, payload, reason: "" };
      }}
      extra={
        hasOverride ? (
          <>
            <Button
              variant="outline"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await requestChange({ kind: "account_conditions", account_id: accountId, payload: { fee_override: null, release_override: null }, reason: "Voltar para a regra geral da plataforma" });
                  setInfo(r.ok ? "Pedido registrado. Aguardando outra pessoa aprovar." : r.error);
                })
              }
            >
              Voltar para a regra geral
            </Button>
            {info && <span className="text-xs text-muted">{info}</span>}
          </>
        ) : null
      }
    />
  );
}

export interface SettingsNow {
  cardPercentBps: number;
  cardFixedCents: number;
  pixFixedCents: number;
  installmentBps: number;
  newAccountReleaseDays: number;
  pixReleaseDays: number;
  cardReleaseDays: number;
  reserveBps: number;
  reserveDays: number;
  pixExpiresMinutes: number;
  pixKeyChangeBlockHours: number;
}

/** B05 — Configurações da plataforma: cada publicação aprovada vira uma versão nova. */
export function SettingsForm({ now }: { now: SettingsNow }) {
  const fields: FieldDef[] = [
    { key: "cardPercentBps", label: "Taxa do cartão", kind: "percent", value: now.cardPercentBps },
    { key: "cardFixedCents", label: "Fixo do cartão", kind: "money", value: now.cardFixedCents },
    { key: "pixFixedCents", label: "Fixo do Pix", kind: "money", value: now.pixFixedCents },
    { key: "installmentBps", label: "Juros do parcelamento", kind: "percent", suffix: "% ao mês", value: now.installmentBps },
    { key: "newAccountReleaseDays", label: "Liberação para conta nova", kind: "int", suffix: "dias", value: now.newAccountReleaseDays },
    { key: "pixReleaseDays", label: "Liberação do Pix", kind: "int", suffix: "dias", value: now.pixReleaseDays },
    { key: "cardReleaseDays", label: "Liberação do cartão", kind: "int", suffix: "dias", value: now.cardReleaseDays },
    { key: "reserveBps", label: "Reserva de segurança", kind: "percent", value: now.reserveBps },
    { key: "reserveDays", label: "Reserva devolvida em", kind: "int", suffix: "dias", value: now.reserveDays },
    { key: "pixExpiresMinutes", label: "Validade do Pix no checkout", kind: "int", suffix: "min", value: now.pixExpiresMinutes },
    { key: "pixKeyChangeBlockHours", label: "Bloqueio após trocar chave Pix", kind: "int", suffix: "horas", value: now.pixKeyChangeBlockHours },
  ];
  return (
    <ChangeForm
      fields={fields}
      submitLabel="Pedir publicação"
      build={(c) => {
        const payload: Record<string, unknown> = {};
        const card = { ...("cardPercentBps" in c ? { percentBps: c.cardPercentBps } : {}), ...("cardFixedCents" in c ? { fixedCents: c.cardFixedCents } : {}) };
        const fees = {
          ...(Object.keys(card).length ? { card } : {}),
          ...("pixFixedCents" in c ? { pix: { fixedCents: c.pixFixedCents } } : {}),
          ...("installmentBps" in c ? { installmentInterestBpsMonthly: c.installmentBps } : {}),
        };
        if (Object.keys(fees).length) payload.fees = fees;
        const releaseKeys = ["newAccountReleaseDays", "pixReleaseDays", "cardReleaseDays", "reserveBps", "reserveDays"].filter((k) => k in c);
        if (releaseKeys.length) payload.release = Object.fromEntries(releaseKeys.map((k) => [k, c[k]]));
        for (const k of ["pixExpiresMinutes", "pixKeyChangeBlockHours"]) if (k in c) payload[k] = c[k];
        return { kind: "platform_settings", payload, reason: "" };
      }}
    />
  );
}

/** Aprovar ou recusar um pedido. Quem pediu só pode cancelar o próprio pedido. */
export function ChangeDecision({ id, mine }: { id: string; mine: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (approve: boolean) =>
    startTransition(async () => {
      const r = await decideChange(id, approve);
      setError(r.ok ? null : r.error);
    });
  return (
    <div className="mt-2">
      {error && <p className="mb-2 text-sm text-bad">{error}</p>}
      {mine ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Você pediu esta alteração. Outra pessoa da equipe precisa aprovar.</span>
          <Button size="sm" variant="outline" loading={pending} onClick={() => run(false)}>
            Cancelar pedido
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" loading={pending} onClick={() => run(true)}>
            Aprovar
          </Button>
          <Button size="sm" variant="outline" loading={pending} onClick={() => run(false)}>
            Recusar
          </Button>
        </div>
      )}
    </div>
  );
}
