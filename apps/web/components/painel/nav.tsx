"use client";

import { CreditCard, Home, LineChart, Package, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

// Menu principal com quatro itens (item 1.2), mais o Início.
const ITEMS = [
  { href: "/painel", label: "Início", icon: Home, exact: true },
  { href: "/painel/vendas", label: "Vendas", icon: LineChart },
  { href: "/painel/produtos", label: "Produtos", icon: Package },
  { href: "/painel/financeiro", label: "Financeiro", icon: CreditCard },
  { href: "/painel/afiliados", label: "Afiliados", icon: Users },
];

export function SideNav() {
  const path = usePathname();
  const active = (item: { href: string; exact?: boolean }) => (item.exact ? path === item.href : path.startsWith(item.href));
  return (
    <nav aria-label="Menu principal" className="flex flex-1 flex-col gap-1">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={active(item) ? "page" : undefined} className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold", active(item) ? "bg-brand-dim text-accent" : "text-paper/80 hover:bg-raised")}>
          <item.icon size={18} aria-hidden /> {item.label}
        </Link>
      ))}
      <Link
        href="/painel/configuracoes"
        aria-current={path.startsWith("/painel/configuracoes") ? "page" : undefined}
        className={cx("mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold", path.startsWith("/painel/configuracoes") ? "bg-brand-dim text-accent" : "text-paper/80 hover:bg-raised")}
      >
        <Settings size={18} aria-hidden /> Integrações e conta
      </Link>
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Menu principal" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-graphite pb-[env(safe-area-inset-bottom)] lg:hidden">
      {ITEMS.map((item) => {
        const active = item.exact ? path === item.href : path.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", active ? "text-accent" : "text-muted")}>
            <item.icon size={20} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
