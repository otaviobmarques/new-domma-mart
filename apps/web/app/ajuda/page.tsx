import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HelpForm } from "@/components/buyer/help-form";
import { Card, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Ajuda", robots: { index: false }, alternates: { canonical: null } };

interface Ticket {
  id: string;
  number: number;
  message: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  due_at: string;
  created_at: string;
  product_name: string | null;
}

const ANSWERS = [
  { q: "Paguei e não recebi o acesso", a: "O acesso é liberado assim que o pagamento é confirmado e aparece em Minhas compras. Se você comprou com outro e-mail, celular ou CPF, entre com ele para encontrar a compra.", href: "/compras", cta: "Abrir minhas compras" },
  { q: "Quero pedir reembolso", a: "Dentro do prazo de garantia o reembolso é automático: em Minhas compras, toque em “Pedir reembolso”. O Pix volta no mesmo dia; no cartão, o estorno aparece na fatura e as parcelas que faltam são canceladas.", href: "/compras", cta: "Ir para minhas compras" },
  { q: "Fui cobrado e não reconheço a compra", a: "Confira em Minhas compras se o pedido está no seu nome. Se não estiver, fale com uma pessoa pelo formulário abaixo e informe a data e o valor da cobrança." },
  { q: "Recebi um link de pagamento estranho", a: "Antes de pagar, confira se o link é mesmo do Domma Mart.", href: "/verificar-link", cta: "Verificar um link" },
];

/** Ajuda do comprador: respostas na hora para o que é comum e uma pessoa, com prazo visível, para o resto. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ assunto?: string; pedido?: string }> }) {
  await requireMe("/ajuda");
  const sp = await searchParams;
  const [{ data: tickets }, { data: purchases }] = await Promise.all([
    api<{ data: Ticket[] }>("/v1/buyer/support"),
    api<{ data: { order_id: string; product_name: string; item_kind: string }[] }>("/v1/buyer/purchases"),
  ]);
  const orders = purchases.filter((p) => p.item_kind === "main").map((p) => ({ id: p.order_id, name: p.product_name }));

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-graphite">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link href="/compras" className="flex items-center gap-1.5 text-lg font-extrabold">
            <ChevronLeft size={20} aria-hidden /> Ajuda
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-5">
        {tickets.length > 0 && (
          <section>
            <h2 className="mb-2 font-bold">Seus pedidos de ajuda</h2>
            <div className="space-y-2.5">
              {tickets.map((t) => (
                <Card key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-muted">
                      <span className="num">#{t.number}</span> · {formatDateTime(t.created_at)}
                      {t.product_name ? ` · ${t.product_name}` : ""}
                    </p>
                    <StatusBadge status={t.status === "answered" ? "completed" : "pending"} label={t.status === "answered" ? "Respondido" : "Aguardando resposta"} />
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-line">{t.message}</p>
                  {t.answer ? (
                    <div className="mt-3 rounded-xl bg-ok-dim p-3 text-sm">
                      <p className="text-xs font-bold text-ok">Resposta do Domma Mart · {formatDateTime(t.answered_at!)}</p>
                      <p className="mt-1 whitespace-pre-line">{t.answer}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-wait">Uma pessoa responde até {formatDateTime(t.due_at)}.</p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-bold">Respostas rápidas</h2>
          <div className="space-y-2">
            {ANSWERS.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-line bg-graphite">
                <summary className="cursor-pointer list-none px-4 py-3.5 font-semibold [&::-webkit-details-marker]:hidden">{item.q}</summary>
                <div className="px-4 pb-4 text-sm text-muted">
                  <p>{item.a}</p>
                  {item.href && (
                    <Link href={item.href} className="mt-2 inline-block font-bold text-accent underline underline-offset-4">
                      {item.cta}
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-bold">Falar com uma pessoa</h2>
          <Card className="p-4">
            <HelpForm orders={orders} initialTopic={sp.assunto ?? ""} initialOrder={sp.pedido ?? ""} />
          </Card>
          <p className="mt-2 text-xs text-muted">Dúvidas sobre o conteúdo do curso são com o produtor; o contato dele está no checkout e no e-mail de acesso.</p>
        </section>
      </main>
    </div>
  );
}
