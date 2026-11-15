import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <Link href="/" className="mx-auto">
        <Logo size={34} />
      </Link>
      <h1 className="mt-8 text-center text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 mb-6 text-center text-muted">{subtitle}</p>
      {children}
      {footer && <div className="mt-auto pt-10 text-center text-sm text-muted">{footer}</div>}
    </main>
  );
}
