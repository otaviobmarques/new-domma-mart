"use client";

import { ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { sendChargebackEvidence } from "@/app/painel/actions";
import { Button, Card, Money, Notice, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/format";

interface Chargeback {
  status: string;
  reason: string;
  due_at: string;
  evidence: string | null;
}

/** Venda contestada: explica o que aconteceu, o prazo e recebe as provas do produtor. */
export function ChargebackEvidence({ orderId, chargeback, netCents }: { orderId: string; chargeback: Chargeback; netCents: number }) {
  const [text, setText] = useState(chargeback.evidence ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (chargeback.status === "won") return <Notice tone="ok">Você ganhou esta contestação. O valor voltou para o seu saldo disponível.</Notice>;
  if (chargeback.status === "lost") return <Notice tone="bad">O banco decidiu a favor do comprador. O valor foi devolvido a ele e o acesso ao produto foi cancelado.</Notice>;

  return (
    <Card className="border-bad/40 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <ShieldAlert size={18} className="text-bad" aria-hidden /> O comprador contestou esta compra no banco
      </h2>
      <p className="mt-1.5 text-sm text-muted">
        Motivo informado: {chargeback.reason}. Os <Money cents={netCents} /> desta venda ficam separados até o resultado.
      </p>
      {chargeback.status === "defended" ? (
        <div className="mt-3">
          <Notice tone="wait">A defesa já foi enviada ao banco. Agora é só aguardar: avisamos por e-mail quando sair o resultado.</Notice>
          {chargeback.evidence && <p className="mt-3 rounded-lg bg-raised p-3 text-sm whitespace-pre-wrap">{chargeback.evidence}</p>}
        </div>
      ) : (
        <>
          <label className="mt-3 block text-sm font-semibold">
            Conte o que comprova a entrega, até {formatDate(chargeback.due_at)}
            <textarea
              className={`${inputClass} mt-1.5 h-32 py-2.5`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: a pessoa acessou o curso nos dias tais, assistiu tantas aulas, conversou comigo pelo WhatsApp…"
            />
          </label>
          <p className="mt-1.5 text-xs text-muted">A equipe Domma junta isso com os registros de acesso e envia a defesa ao banco por você.</p>
          {message && (
            <div className="mt-2">
              <Notice tone={message.tone}>{message.text}</Notice>
            </div>
          )}
          <Button
            className="mt-3"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await sendChargebackEvidence(orderId, text);
                setMessage(r.ok ? { tone: "ok", text: "Provas recebidas. Você pode completar o texto enquanto a defesa não for enviada." } : { tone: "bad", text: r.error });
              })
            }
          >
            {chargeback.evidence ? "Atualizar provas" : "Enviar provas"}
          </Button>
        </>
      )}
    </Card>
  );
}
