"use client";

import { useRef, useState, useTransition } from "react";
import { openTicket } from "@/app/buyer-actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const TOPICS = [
  ["access", "Não consigo acessar o conteúdo"],
  ["payment", "Pagamento ou cobrança"],
  ["refund", "Reembolso"],
  ["other", "Outro assunto"],
] as const;

export function HelpForm({ orders, initialTopic, initialOrder }: { orders: { id: string; name: string }[]; initialTopic: string; initialOrder: string }) {
  const [topic, setTopic] = useState(TOPICS.some(([t]) => t === initialTopic) ? initialTopic : "access");
  const [orderId, setOrderId] = useState(orders.some((o) => o.id === initialOrder) ? initialOrder : (orders[0]?.id ?? ""));
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ number: number; due_at: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const key = useRef("");

  if (sent) {
    return (
      <Notice tone="ok">
        Recebemos o seu pedido <span className="num font-bold">#{sent.number}</span>. Uma pessoa responde até <span className="font-bold">{formatDateTime(sent.due_at)}</span>, por e-mail e aqui nesta página.
      </Notice>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (message.trim().length < 10) return setError("Conte um pouco mais para a gente conseguir ajudar.");
        setError(null);
        if (!key.current) key.current = crypto.randomUUID();
        startTransition(async () => {
          const r = await openTicket(topic, message, orderId || null, key.current);
          if (r.ok) setSent(r);
          else {
            key.current = "";
            setError(r.error);
          }
        });
      }}
    >
      <Field label="Sobre o quê?">
        <select className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)}>
          {TOPICS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {orders.length > 0 && (
        <Field label="Qual compra?">
          <select className={inputClass} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="">Nenhuma em especial</option>
          </select>
        </Field>
      )}
      <Field label="O que aconteceu?" error={error}>
        <textarea className={`${inputClass} h-28 py-2.5`} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} aria-invalid={Boolean(error)} />
      </Field>
      <Button full size="lg" type="submit" loading={pending}>
        Enviar para uma pessoa
      </Button>
      <p className="text-center text-xs text-muted">Resposta em até 1 dia útil.</p>
    </form>
  );
}
