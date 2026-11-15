import { NewApiKey, NewWebhook } from "@/components/painel/integrations";
import { Card, Notice, PageTitle, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { deleteWebhook, revokeApiKey } from "../actions";

interface Key {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
}
interface Hook {
  id: string;
  url: string;
  events: string[];
  last_delivery: { status: string; attempts: number } | null;
}

/** P11 — Integrações e API: o que é usado raramente fica aqui. */
export default async function SettingsPage() {
  let keys: Key[];
  let hooks: Hook[];
  try {
    [{ data: keys }, { data: hooks }] = await Promise.all([api<{ data: Key[] }>("/v1/api-keys"), api<{ data: Hook[] }>("/v1/webhooks")]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <>
          <PageTitle title="Integrações e conta" />
          <Notice tone="wait">Só o dono e os administradores da conta gerenciam chaves de API e webhooks.</Notice>
        </>
      );
    }
    throw err;
  }
  const docsUrl = `${(process.env.PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "")}/docs`;

  return (
    <>
      <PageTitle title="Integrações e conta" subtitle="Chaves de API e webhooks para ligar o Domma Mart aos seus sistemas." />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold">Chaves de API</h2>
        </div>
        {keys.length > 0 && (
          <Card className="mb-3 divide-y divide-line">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{k.name}</p>
                  <p className="num truncate text-xs text-muted">
                    {k.prefix} · criada em {formatDate(k.created_at)} · {k.scopes.length} {k.scopes.length === 1 ? "permissão" : "permissões"}
                  </p>
                </div>
                <form action={revokeApiKey.bind(null, k.id)}>
                  <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-raised">Revogar</button>
                </form>
              </div>
            ))}
          </Card>
        )}
        <NewApiKey />
        <p className="mt-2 text-xs text-muted">A chave completa aparece uma única vez, na criação. Criar chave pede confirmação em duas etapas.</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-bold">Webhooks</h2>
        {hooks.length > 0 && (
          <Card className="mb-3 divide-y divide-line">
            {hooks.map((h) => (
              <div key={h.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="num truncate text-sm">{h.url}</p>
                  <p className="num mt-0.5 truncate text-xs text-muted">{h.events.length ? h.events.join(", ") : "todos os eventos"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {h.last_delivery ? (
                    <StatusBadge status={h.last_delivery.status === "delivered" ? "delivered" : h.last_delivery.status === "failed" ? "failed" : "pending"} label={h.last_delivery.status === "delivered" ? "Entregue" : h.last_delivery.status === "failed" ? "Falhou" : `Tentando (${h.last_delivery.attempts}x)`} />
                  ) : (
                    <span className="text-xs text-muted">Sem entregas ainda</span>
                  )}
                  <form action={deleteWebhook.bind(null, h.id)}>
                    <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-raised">Remover</button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
        )}
        <NewWebhook />
        <p className="mt-2 text-xs text-muted">Toda entrega é assinada. Se o seu endereço falhar, tentamos de novo com intervalos crescentes por até 72 horas.</p>
      </section>

      <a href={docsUrl} target="_blank" rel="noreferrer" className="mt-8 inline-block font-bold text-brand underline underline-offset-4">
        Abrir a documentação da API
      </a>
    </>
  );
}
