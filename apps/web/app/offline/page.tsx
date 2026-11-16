import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Sem conexão", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <Logo />
      <h1 className="mt-4 text-xl font-extrabold">Você está sem conexão</h1>
      <p className="text-muted">Suas vendas e seu saldo continuam seguros. Assim que a internet voltar, é só abrir de novo.</p>
      <a href="/" className="font-bold text-accent underline underline-offset-4">
        Tentar de novo
      </a>
    </main>
  );
}
