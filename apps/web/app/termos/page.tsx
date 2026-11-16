import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Termos de compra", description: "Termos de compra do Domma Mart.", alternates: { canonical: "/termos" } };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/">
        <Logo />
      </Link>
      <h1 className="mt-8 text-2xl font-extrabold">Termos de compra</h1>
      <p className="mt-2 rounded-xl border border-wait/30 bg-wait-dim p-3 text-sm text-wait">Texto provisório. A versão final depende do parecer jurídico (capítulo 13 do descritivo) e precisa ser publicada antes do lançamento.</p>
      <div className="mt-6 space-y-4 text-muted">
        <p>O Domma Mart processa o pagamento e entrega o acesso ao produto digital vendido pelo produtor identificado no checkout. O conteúdo é de responsabilidade do produtor.</p>
        <p>Toda compra tem garantia de pelo menos 7 dias. Dentro desse prazo, o reembolso é pedido em “Minhas compras” e aprovado automaticamente, sem depender do produtor. O valor volta pela mesma forma de pagamento.</p>
        <p>Seus dados são usados para processar a compra, entregar o acesso e prevenir fraudes. Você pode pedir a exportação ou a exclusão dos seus dados.</p>
        <p>
          Recebeu um link suspeito?{" "}
          <Link href="/verificar-link" className="text-accent underline">
            Confira se ele é verdadeiro
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
