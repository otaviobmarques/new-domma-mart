"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/backoffice", label: "Painel" },
  { href: "/backoffice/contas", label: "Contas" },
  { href: "/backoffice/risco", label: "Risco" },
  { href: "/backoffice/configuracoes", label: "Configurações" },
];

export function BackofficeNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 text-sm font-semibold" aria-label="Backoffice">
      {ITEMS.map((item) => {
        const active = item.href === "/backoffice" ? path === item.href : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-2.5 py-2.5 whitespace-nowrap ${active ? "border-brand text-paper" : "border-transparent text-muted hover:text-paper"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
