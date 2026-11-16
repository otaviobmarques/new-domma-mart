"use client";

import { useState, useTransition } from "react";
import { sendDefense, setChargebackResult, simulateChargeback } from "@/app/backoffice/actions";
import { Button, Notice, inputClass } from "@/components/ui";

/** Passos da contestação: enviar a defesa à adquirente e depois registrar o resultado. */
export function ChargebackActions({ id, status, hasEvidence }: { id: string; status: string; hasEvidence: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"won" | "lost" | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Não deu certo. Tente de novo."));
      setConfirm(null);
    });
  if (status === "won" || status === "lost") return null;
  return (
    <div className="mt-3">
      {error && (
        <div className="mb-2">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      {status === "open" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={pending} onClick={() => run(() => sendDefense(id))}>
            Registrar defesa enviada
          </Button>
          {!hasEvidence && <span className="text-xs text-wait">O produtor ainda não enviou provas.</span>}
        </div>
      )}
      {status === "defended" && !confirm && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirm("won")}>
            Ganhou
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirm("lost")}>
            Perdeu
          </Button>
        </div>
      )}
      {confirm && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <p className="font-semibold">
            {confirm === "won" ? "Confirmar que a contestação foi ganha? O valor volta para o saldo do produtor." : "Confirmar que a contestação foi perdida? O valor volta ao comprador e o acesso é cancelado."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant={confirm === "won" ? "primary" : "danger"} loading={pending} onClick={() => run(() => setChargebackResult(id, confirm))}>
              Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Só no ambiente de testes: cria uma contestação em uma venda paga para treinar o fluxo. */
export function SimulateChargeback({ orders }: { orders: { id: string; label: string }[] }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (orders.length === 0) return <p className="text-sm text-muted">Nenhuma venda paga para simular. Faça uma compra de teste primeiro.</p>;
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select className={`${inputClass} h-11 min-w-0`} value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="Venda">
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          className="shrink-0"
          variant="outline"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await simulateChargeback(orderId, "Compra não reconhecida");
              setMessage(r.ok ? { tone: "ok", text: "Contestação criada. Ela já aparece na fila." } : { tone: "bad", text: r.error });
            })
          }
        >
          Simular contestação
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
