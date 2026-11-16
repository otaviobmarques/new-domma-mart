import type { PaymentProvider } from "@domma/core";
import type { Sql } from "@domma/db";
import type { Config } from "../env.ts";
import type { EmailSender } from "../services/email-sender.ts";
import type { Storage } from "../services/storage.ts";

export interface Deps {
  sql: Sql;
  config: Config;
  provider: PaymentProvider;
  now: () => Date;
  /** Avisa os navegadores que acompanham um pedido (confirmação de Pix em tempo real). */
  orderBus: OrderBus;
  /** Quem envia os e-mails. Sem isto, usa o Resend quando há chave e o log quando não há. */
  emailSender?: EmailSender;
  /** Onde ficam os arquivos enviados. Sem isto, é escolhido pela configuração. */
  storage?: Storage;
}

type Listener = (status: string) => void;

export class OrderBus {
  private listeners = new Map<string, Set<Listener>>();
  subscribe(orderId: string, fn: Listener): () => void {
    const set = this.listeners.get(orderId) ?? new Set();
    set.add(fn);
    this.listeners.set(orderId, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(orderId);
    };
  }
  publish(orderId: string, status: string) {
    for (const fn of this.listeners.get(orderId) ?? []) fn(status);
  }
}
