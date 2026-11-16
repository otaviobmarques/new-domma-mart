import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChangeList } from "@/components/backoffice/change-list";
import { SettingsForm } from "@/components/backoffice/changes";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import type { Change } from "@/lib/changes";
import { formatDateTime } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Configurações · Backoffice" };

interface Settings {
  version: number;
  fees: { pix: { fixedCents: number }; card: { percentBps: number; fixedCents: number }; installmentInterestBpsMonthly: number };
  release: { newAccountReleaseDays: number; pixReleaseDays: number; cardReleaseDays: number; reserveBps: number; reserveDays: number };
  pixExpiresMinutes: number;
  pixKeyChangeBlockHours: number;
  prohibitedCategories: string[];
  versions: { version: number; published_at: string; published_by_name: string | null; approved_by_name: string | null }[];
}

/** B05 — Configurações da plataforma: valores em vigor, pedidos de mudança e versões anteriores. */
export default async function SettingsPage() {
  const me = await requireMe("/backoffice/configuracoes");
  if (!me.user.is_backoffice) notFound();
  const [s, changes] = await Promise.all([api<Settings>("/v1/backoffice/settings"), api<{ data: Change[] }>("/v1/backoffice/changes?kind=platform_settings")]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">Configurações da plataforma</h1>
      <p className="mt-1 text-sm text-muted">Valem para todas as contas que não têm condição própria. Toda mudança precisa de duas pessoas: uma pede, outra aprova.</p>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold">Em vigor {s.version ? `· versão ${s.version}` : ""}</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted">Altere o que precisar e escreva o motivo. Vendas já feitas não mudam: cada uma guarda a taxa do dia.</p>
          <SettingsForm
            key={s.version}
            now={{
              cardPercentBps: s.fees.card.percentBps,
              cardFixedCents: s.fees.card.fixedCents,
              pixFixedCents: s.fees.pix.fixedCents,
              installmentBps: s.fees.installmentInterestBpsMonthly,
              newAccountReleaseDays: s.release.newAccountReleaseDays,
              pixReleaseDays: s.release.pixReleaseDays,
              cardReleaseDays: s.release.cardReleaseDays,
              reserveBps: s.release.reserveBps,
              reserveDays: s.release.reserveDays,
              pixExpiresMinutes: s.pixExpiresMinutes,
              pixKeyChangeBlockHours: s.pixKeyChangeBlockHours,
            }}
          />
        </Card>

        <div className="space-y-3">
          <Card className="p-5">
            <h2 className="font-bold">Pedidos de mudança</h2>
            {changes.data.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum pedido até agora.</p> : <ChangeList changes={changes.data} />}
          </Card>
          <Card className="p-5">
            <h2 className="font-bold">Versões publicadas</h2>
            {s.versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Só a configuração inicial.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line text-sm">
                {s.versions.map((v) => (
                  <li key={v.version} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-semibold">
                      Versão {v.version}
                      {v.version === s.version ? " · em vigor" : ""}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDateTime(v.published_at)}
                      {v.published_by_name ? ` · pedida por ${v.published_by_name}, aprovada por ${v.approved_by_name}` : " · configuração inicial"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-bold">Categorias proibidas</h2>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {s.prohibitedCategories.map((c) => (
                <li key={c} className="rounded-md border border-line bg-raised px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}
