import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TestEmail, Unblock } from "@/components/backoffice/emails";
import { Card, Empty, Notice, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "E-mails · Backoffice" };

interface Emails {
  provider: "resend" | "log";
  from: string;
  bounce_tracking: boolean;
  webhook_url: string;
  codes_on_screen: boolean;
  counts: { sent_24h: number; failed_24h: number; pending: number; suppressed_24h: number };
  problems: { id: string; recipient: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string }[];
  suppressions: { email: string; reason: string; detail: string | null; created_at: string }[];
}

const TEMPLATE: Record<string, string> = {
  login_code: "Código de acesso",
  access_granted: "Acesso liberado",
  refund_update: "Reembolso",
  withdrawal_update: "Saque",
  pix_key_changed: "Troca de chave Pix",
  product_review: "Aviso",
  notice: "Aviso",
  test: "Teste",
};
const STATUS: Record<string, { status: string; label: string }> = {
  failed: { status: "failed", label: "Não entregue" },
  suppressed: { status: "blocked", label: "Endereço bloqueado" },
  pending: { status: "pending", label: "Tentando de novo" },
};

/** Como está a entrega dos e-mails: o que saiu, o que falhou e quais endereços estão bloqueados. */
export default async function EmailsPage() {
  const me = await requireMe("/backoffice/emails");
  if (!me.user.is_backoffice) notFound();
  const e = await api<Emails>("/v1/backoffice/emails");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">E-mails</h1>
      <p className="mt-1 text-sm text-muted">Código de acesso, acesso liberado, reembolso, saque e avisos. Aqui dá para ver se estão chegando.</p>

      <div className="mt-4 space-y-2">
        {e.provider === "log" ? (
          <Notice tone="bad">Os e-mails ainda não estão sendo enviados de verdade: falta a chave do Resend (RESEND_API_KEY). Por enquanto as mensagens só aparecem no registro do servidor.</Notice>
        ) : (
          <Notice tone="ok">
            Envio ligado pelo Resend. Remetente: <b>{e.from}</b>
          </Notice>
        )}
        {e.provider === "resend" && !e.bounce_tracking && (
          <Notice tone="wait">
            O aviso de devoluções ainda não está ligado. No Resend, crie um webhook para <span className="num break-all">{e.webhook_url}</span> com os eventos de devolução e de spam, e coloque o segredo em RESEND_WEBHOOK_SECRET.
          </Notice>
        )}
        {e.codes_on_screen && <Notice tone="wait">Modo de testes: o código de acesso também aparece na tela de entrada. Antes de abrir para o público, mude DOMMA_ENV para production.</Notice>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Enviados em 24 horas", e.counts.sent_24h, ""],
          ["Não entregues em 24 horas", e.counts.failed_24h, e.counts.failed_24h ? "text-bad" : ""],
          ["Na fila agora", e.counts.pending, ""],
          ["Barrados por bloqueio", e.counts.suppressed_24h, ""],
        ].map(([label, value, tone]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className={`num mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-3 p-5">
        <h2 className="font-bold">Testar o envio</h2>
        <p className="mt-0.5 mb-3 text-sm text-muted">Manda um e-mail de teste para {me.user.email}.</p>
        <TestEmail />
      </Card>

      <h2 className="mt-7 mb-2 text-lg font-bold">Com problema</h2>
      {e.problems.length === 0 ? (
        <Empty title="Nenhum e-mail com problema" />
      ) : (
        <Card className="divide-y divide-line">
          {e.problems.map((p) => (
            <div key={p.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-all">
                  <span className="font-semibold">{TEMPLATE[p.template] ?? p.template}</span> para {p.recipient}
                </p>
                <StatusBadge {...(STATUS[p.status] ?? { status: p.status })} />
              </div>
              <p className="mt-1 text-xs break-words text-muted">
                {formatDateTime(p.created_at)} · {p.attempts} {p.attempts === 1 ? "tentativa" : "tentativas"}
                {p.last_error ? ` · ${p.last_error}` : ""}
              </p>
            </div>
          ))}
        </Card>
      )}

      <h2 className="mt-7 mb-2 text-lg font-bold">Endereços bloqueados</h2>
      <p className="mb-2 text-sm text-muted">Endereços que não existem ou que marcaram a mensagem como spam. Não enviamos mais nada para eles, para não prejudicar a entrega dos outros.</p>
      {e.suppressions.length === 0 ? (
        <Empty title="Nenhum endereço bloqueado" />
      ) : (
        <Card className="divide-y divide-line">
          {e.suppressions.map((s) => (
            <div key={s.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold break-all">{s.email}</span>
                <span className="block text-xs text-muted">
                  {s.reason === "complained" ? "Marcou como spam" : "Endereço devolveu a mensagem"} · {formatDateTime(s.created_at)}
                </span>
              </span>
              <Unblock email={s.email} />
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
