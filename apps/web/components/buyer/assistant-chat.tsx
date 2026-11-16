"use client";

import { Check, Mail, SendHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { type AssistantCard, type AssistantMessage, resetAssistant, sendAssistantMessage } from "@/app/buyer-actions";
import { Spinner, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const SUGGESTIONS = ["Paguei e não recebi o acesso", "Quero pedir reembolso", "Como está o meu reembolso?", "Não reconheço uma cobrança"];

function Cards({ cards }: { cards: AssistantCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      {cards.map((card, i) =>
        card.type === "link" && card.href ? (
          <Link key={i} href={card.href} className={buttonClass({ variant: "outline", size: "sm" })}>
            {card.label}
          </Link>
        ) : card.type === "ticket" ? (
          <p key={i} className="flex items-start gap-2 rounded-xl bg-wait-dim px-3 py-2 text-sm text-wait">
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Pedido <span className="num font-bold">#{card.number}</span> aberto. Uma pessoa responde até {formatDateTime(card.due_at!)}.
            </span>
          </p>
        ) : card.type === "access_sent" ? (
          <p key={i} className="flex items-start gap-2 rounded-xl bg-ok-dim px-3 py-2 text-sm text-ok">
            <Mail size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>Link de acesso reenviado para o seu e-mail.</span>
          </p>
        ) : null,
      )}
    </div>
  );
}

/** Chat com a assistente: resolve o que é comum na hora e encaminha o resto para uma pessoa. */
export function AssistantChat({ initial, firstName }: { initial: AssistantMessage[]; firstName: string }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Rola só a caixa do chat, sem puxar a página inteira.
    if (messages.length > initial.length || pending) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending, initial.length]);

  const send = (value: string) => {
    const message = value.trim();
    if (message.length < 2 || pending) return;
    setError(null);
    setText("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: message, cards: [], created_at: new Date().toISOString() }]);
    startTransition(async () => {
      const r = await sendAssistantMessage(message);
      if (r.ok) setMessages((m) => [...m, r.message]);
      else setError(r.error);
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-graphite">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 font-bold">
          <span className="grid size-7 place-items-center rounded-full bg-brand text-onbrand">
            <Sparkles size={15} aria-hidden />
          </span>
          Assistente Domma
          <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-bold text-muted">IA</span>
        </p>
        {messages.length > 0 && (
          <button
            type="button"
            className="text-xs font-semibold text-muted underline underline-offset-4 hover:text-paper"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await resetAssistant();
                setMessages([]);
                setError(null);
              })
            }
          >
            Nova conversa
          </button>
        )}
      </div>

      <div ref={listRef} className="max-h-[26rem] space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-raised px-3.5 py-2.5 text-sm">
          Oi, {firstName}! Eu consigo ver as suas compras e resolver na hora o que é mais comum: acesso, pagamento e reembolso. Se precisar, chamo uma pessoa da equipe.
        </div>
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-tr-md bg-brand px-3.5 py-2.5 text-sm font-medium whitespace-pre-line text-onbrand">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-[88%]">
              <div className="w-fit rounded-2xl rounded-tl-md bg-raised px-3.5 py-2.5 text-sm whitespace-pre-line">{m.content}</div>
              <Cards cards={m.cards} />
            </div>
          ),
        )}
        {pending && (
          <div className="flex w-fit items-center gap-2 rounded-2xl rounded-tl-md bg-raised px-3.5 py-2.5 text-sm text-muted">
            <Spinner /> Vendo as suas compras…
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={pending} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:bg-raised">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={1}
          maxLength={1500}
          placeholder="Escreva o que aconteceu"
          aria-label="Sua mensagem"
          className="max-h-32 min-h-11 w-full resize-none rounded-xl border border-line bg-ink px-3.5 py-2.5 text-base outline-none focus:border-brand"
        />
        <button type="submit" disabled={pending || text.trim().length < 2} aria-label="Enviar mensagem" className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-onbrand disabled:opacity-40">
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
