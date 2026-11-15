import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { RefundButton } from "@/components/buyer/refund-button";
import { ButtonLink, Card, Cover, Empty, Money, Notice, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, paymentLabel } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Minhas compras" };

interface Purchase {
  order_id: string;
  status: string;
  method: string;
  installments: number;
  buyer_total_cents: number;
  price_cents: number;
  paid_at: string;
  item_kind: string;
  product_id: string;
  product_name: string;
  cover_url: string | null;
  support_contact: string | null;
  seller_name: string;
  can_access: boolean;
  guarantee_days_left: number;
  can_request_refund: boolean;
  refund_id: string | null;
  refund_status: string | null;
  lessons_total: number;
  lessons_done: number;
}

/** C05 — Minhas compras: tudo o que o comprador precisa em um só lugar. */
export default async function PurchasesPage() {
  const me = await requireMe("/compras");
  const { data, restricted } = await api<{ data: Purchase[]; restricted: boolean }>("/v1/buyer/purchases");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-graphite">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <h1 className="text-lg font-extrabold">Minhas compras</h1>
          <div className="flex items-center gap-3 text-sm">
            {me.accounts.length > 0 && (
              <Link href="/painel" className="font-semibold text-brand">
                Painel de vendas
              </Link>
            )}
            <form action={logout}>
              <button className="font-semibold text-muted hover:text-paper">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {restricted && (
          <Notice tone="brand">
            Você entrou pelo botão da compra, então aparece só este pedido.{" "}
            <Link href="/entrar?next=/compras" className="font-bold underline">
              Entre com o código do seu e-mail
            </Link>{" "}
            para ver todas as suas compras.
          </Notice>
        )}
        {data.length === 0 && (
          <Empty title="Nenhuma compra por aqui ainda">
            Se você comprou com outro e-mail, celular ou CPF,{" "}
            <Link href="/entrar?next=/compras" className="font-bold text-brand underline">
              entre com ele
            </Link>{" "}
            para encontrar a sua compra.
          </Empty>
        )}
        {data.map((p) => {
          const progress = p.lessons_total ? Math.round((p.lessons_done / p.lessons_total) * 100) : 0;
          return (
            <Card key={`${p.order_id}:${p.product_id}`} className="p-4">
              <div className="flex gap-3.5">
                <Cover src={p.cover_url} size={56} />
                <div className="min-w-0">
                  <h2 className="leading-snug font-bold">{p.product_name}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Comprado em {formatDate(p.paid_at)} · {paymentLabel(p.method, p.installments)} · <Money cents={p.item_kind === "main" ? p.buyer_total_cents : p.price_cents} />
                  </p>
                </div>
              </div>

              {p.status === "refunded" ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge status="refunded" label="Reembolsada" />
                  {p.refund_id && (
                    <Link href={`/reembolso/${p.refund_id}`} className="text-sm font-semibold text-brand underline underline-offset-4">
                      Acompanhar reembolso
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  {p.lessons_total > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted">
                        <span>Seu progresso</span>
                        <span>
                          {p.lessons_done} de {p.lessons_total} aulas
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                  {p.can_access && (
                    <ButtonLink href={`/assistir/${p.product_id}`} full className="mt-3">
                      {p.lessons_done > 0 ? "Continuar assistindo" : "Acessar"}
                    </ButtonLink>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {p.guarantee_days_left > 0 && (
                      <span className="rounded-md bg-ok-dim px-2 py-1 text-xs font-bold text-ok">
                        Garantia: {p.guarantee_days_left === 1 ? "falta 1 dia" : `faltam ${p.guarantee_days_left} dias`}
                      </span>
                    )}
                    {p.refund_status === "requested" && p.refund_id && (
                      <Link href={`/reembolso/${p.refund_id}`} className="text-sm font-semibold text-wait underline underline-offset-4">
                        Reembolso em análise pelo produtor
                      </Link>
                    )}
                    {p.refund_status === "denied" && p.refund_id && (
                      <Link href={`/reembolso/${p.refund_id}`} className="text-sm font-semibold text-muted underline underline-offset-4">
                        Ver resposta do reembolso
                      </Link>
                    )}
                    {p.can_request_refund && <RefundButton orderId={p.order_id} productName={p.product_name} daysLeft={p.guarantee_days_left} />}
                  </div>
                </>
              )}
            </Card>
          );
        })}

        <Card className="flex items-start gap-3 border-brand/20 bg-brand-dim p-4">
          <MessageSquare size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <div className="text-sm">
            <p className="font-bold text-brand">Precisa de ajuda?</p>
            <p className="mt-0.5 text-paper/80">
              Dúvidas sobre o conteúdo: fale com o produtor{data[0]?.support_contact ? ` (${data[0].support_contact})` : ""}. Problemas com pagamento ou acesso: uma pessoa do Domma Mart responde em até 1 dia útil.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
