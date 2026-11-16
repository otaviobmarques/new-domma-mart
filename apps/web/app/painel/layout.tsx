import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/auth-actions";
import { BottomNav, SideNav } from "@/components/painel/nav";
import { InstallButton } from "@/components/pwa";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, Card, Logo } from "@/components/ui";
import { requireMe } from "@/lib/session";
import { createProducerAccount } from "./actions";

export const metadata: Metadata = { title: "Painel", robots: { index: false }, alternates: { canonical: null } };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/painel");
  if (me.accounts.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
        <Logo />
        <Card className="mt-8 p-5">
          <h1 className="text-xl font-extrabold">Quer vender no Domma Mart?</h1>
          <p className="mt-2 text-muted">
            {me.restricted ? "Entre com o código enviado ao seu e-mail para criar a sua conta de produtor." : "Você já compra por aqui. Crie a sua conta de produtor em um clique e coloque o primeiro produto à venda."}
          </p>
          {me.restricted ? (
            <Link href="/entrar?next=/painel" className="mt-4 inline-block font-bold text-accent underline underline-offset-4">
              Entrar com código
            </Link>
          ) : (
            <form action={createProducerAccount}>
              <Button full size="lg" className="mt-4">
                Criar conta de produtor
              </Button>
            </form>
          )}
          <Link href="/compras" className="mt-4 block text-center text-sm font-semibold text-muted underline underline-offset-4">
            Voltar para minhas compras
          </Link>
        </Card>
      </main>
    );
  }
  const initial = me.user.name.charAt(0).toUpperCase();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-graphite p-4 lg:flex">
        <Link href="/painel" className="px-2 pt-1">
          <Logo size={26} />
        </Link>
        <SideNav />
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-line px-4 lg:justify-end lg:px-8">
          <Link href="/painel" className="lg:hidden">
            <Logo size={22} />
          </Link>
          <details className="relative">
            <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-full bg-raised text-sm font-bold [&::-webkit-details-marker]:hidden" aria-label="Conta">
              {initial}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-graphite p-1.5 text-sm shadow-xl">
              <p className="truncate px-3 py-2 text-muted">{me.user.email}</p>
              <Link href="/painel/configuracoes" className="block rounded-lg px-3 py-2 font-semibold hover:bg-raised">
                Integrações e conta
              </Link>
              <Link href="/compras" className="block rounded-lg px-3 py-2 font-semibold hover:bg-raised">
                Minhas compras
              </Link>
              {me.user.is_backoffice && (
                <Link href="/backoffice" className="block rounded-lg px-3 py-2 font-semibold text-accent hover:bg-raised">
                  Backoffice
                </Link>
              )}
              <ThemeToggle withLabel className="h-auto py-2 text-paper" />
              <InstallButton className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-semibold hover:bg-raised" />
              <form action={logout}>
                <button className="block w-full rounded-lg px-3 py-2 text-left font-semibold hover:bg-raised">Sair</button>
              </form>
            </div>
          </details>
        </header>
        <main className="mx-auto max-w-5xl px-4 pt-5 pb-28 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
