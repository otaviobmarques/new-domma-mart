import Link from "next/link";
import { BackofficeNav } from "@/components/backoffice/nav";
import { Logo } from "@/components/ui";

/** Cabeçalho comum do backoffice. Cada página confere se a pessoa é da equipe. */
export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-graphite">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/backoffice" aria-label="Backoffice">
            <Logo size={24} tag="BACKOFFICE" />
          </Link>
          <Link href="/painel" className="text-sm font-semibold whitespace-nowrap text-muted hover:text-paper">
            Sair
          </Link>
        </div>
        <BackofficeNav />
      </header>
      {children}
    </div>
  );
}
