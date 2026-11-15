import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, StatusBadge, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Contas · Backoffice" };

interface Account {
  id: string;
  name: string;
  email: string;
  status: string;
  kyc_status: string;
  withdrawals_blocked_reason: string | null;
  created_at: string;
  products: number;
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireMe("/backoffice/contas");
  if (!me.user.is_backoffice) notFound();
  const q = ((await searchParams).q ?? "").trim();
  const { data } = await api<{ data: Account[] }>(`/v1/backoffice/accounts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/backoffice" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ChevronLeft size={16} aria-hidden /> Backoffice
      </Link>
      <h1 className="text-2xl font-extrabold">Contas de produtor</h1>
      <form className="mt-4 flex gap-2" action="/backoffice/contas">
        <input name="q" defaultValue={q} placeholder="Nome ou e-mail" aria-label="Buscar conta" className={`${inputClass} h-11`} />
        <button className="h-11 shrink-0 rounded-lg border border-line px-4 text-sm font-semibold hover:bg-raised">Buscar</button>
      </form>
      <div className="mt-4">
        {data.length === 0 ? (
          <Empty title="Nenhuma conta encontrada" />
        ) : (
          <Card className="divide-y divide-line">
            {data.map((a) => (
              <Link key={a.id} href={`/backoffice/contas/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.email} · desde {formatDate(a.created_at)} · {a.products} {a.products === 1 ? "produto" : "produtos"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={a.kyc_status === "approved" ? "approved" : a.kyc_status} label={a.kyc_status === "approved" ? "Identidade verificada" : a.kyc_status === "in_review" ? "Identidade em análise" : "Sem verificação"} />
                  {a.withdrawals_blocked_reason && <StatusBadge status="blocked" label="Saques pausados" />}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </main>
  );
}
