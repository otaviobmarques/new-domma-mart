import { withContext } from "@domma/db";
import type { Deps } from "./lib/deps.ts";
import { deliverOutbox } from "./services/notify.ts";
import { handleProviderEvent, retryPendingRefunds, runDueReleases } from "./services/sales.ts";
import { deliverDueWebhooks } from "./services/webhooks.ts";

/** Marca como vencidos os Pix que passaram da validade sem pagamento. */
export async function expireStalePayments(deps: Deps): Promise<number> {
  const stale = await withContext(deps.sql, { kind: "system" }, (tx) => tx`
    select provider_ref from payments where status = 'pending' and method = 'pix' and expires_at < ${deps.now()} limit 100`);
  for (const p of stale) await handleProviderEvent(deps, { type: "payment.expired", providerRef: p.provider_ref });
  return stale.length;
}

/**
 * Tarefas em segundo plano: tudo o que não precisa ser imediato (e-mails, webhooks,
 * liberações de saldo). Roda junto com a API; com mais volume, vira um serviço separado.
 */
export function startWorker(deps: Deps) {
  const jobs: [name: string, everyMs: number, run: () => Promise<unknown>][] = [
    ["e-mails", 2_000, () => deliverOutbox(deps)],
    ["webhooks", 3_000, () => deliverDueWebhooks(deps)],
    ["liberações", 60_000, () => runDueReleases(deps)],
    ["pix vencidos", 30_000, () => expireStalePayments(deps)],
    ["reembolsos", 60_000, () => retryPendingRefunds(deps)],
    ["limpeza", 3_600_000, () => withContext(deps.sql, { kind: "system" }, (tx) => tx`delete from idempotency_keys where created_at < now() - interval '48 hours'`)],
  ];
  const timers = jobs.map(([name, everyMs, run]) => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await run();
      } catch (err) {
        console.error(`[fila] ${name}:`, err);
      } finally {
        running = false;
      }
    };
    void tick();
    return setInterval(tick, everyMs);
  });
  return () => timers.forEach(clearInterval);
}
