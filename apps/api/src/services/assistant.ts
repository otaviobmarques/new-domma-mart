import { formatBRL } from "@domma/core";
import type { Tx } from "@domma/db";
import type { Deps } from "../lib/deps.ts";
import { createMagicLink } from "./auth.ts";
import { enqueueEmail } from "./notify.ts";

const DAY_MS = 86_400_000;

/** Botões e avisos que acompanham a resposta da assistente. */
export type AssistantCard =
  | { type: "link"; label: string; href: string }
  | { type: "ticket"; number: number; due_at: string }
  | { type: "access_sent"; product: string };

export interface AssistantReply {
  reply: string;
  cards: AssistantCard[];
  source: "model" | "local";
}

export interface Purchase {
  order_number: number;
  product: string;
  seller: string;
  seller_contact: string | null;
  status: "paid" | "refunded" | "chargeback";
  paid_at: string | null;
  payment: string;
  total: string;
  has_access: boolean;
  guarantee_days_left: number;
  refund: { status: string; href: string } | null;
}

type System = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

const REFUND_STATUS: Record<string, string> = {
  requested: "pedido recebido, aguardando a decisão do produtor (até 5 dias úteis)",
  approved: "aprovado, devolução sendo enviada",
  sent: "estorno enviado ao cartão; aparece na próxima fatura ou na seguinte",
  completed: "concluído, valor já devolvido",
  denied: "recusado pelo produtor",
};

/**
 * O que a assistente consegue ver e fazer. Tudo é limitado à pessoa logada (e, na sessão
 * restrita do botão "Acessar meu produto", a uma única compra): o modelo nunca escolhe de quem são os dados.
 */
export class BuyerTools {
  readonly cards: AssistantCard[] = [];
  private resent = 0;
  private ticketOpened = false;

  constructor(
    private deps: Deps,
    private system: System,
    private who: { userId: string; restricted: string | null },
    private nextBusinessDay: (from: Date) => Date,
  ) {}

  private card(card: AssistantCard) {
    if (!this.cards.some((c) => JSON.stringify(c) === JSON.stringify(card))) this.cards.push(card);
  }

  async listPurchases(): Promise<Purchase[]> {
    const { userId, restricted } = this.who;
    const rows = await this.system(
      (tx) => tx`
        select o.id, o.number, o.status, o.method, o.installments, o.buyer_total_cents, o.paid_at, o.guarantee_until,
               p.name as product_name, p.support_contact, a.name as seller_name, r.id as refund_id, r.status as refund_status,
               exists (select 1 from enrollments e where e.order_id = o.id and e.status = 'active') as has_access
        from orders o join products p on p.id = o.product_id join accounts a on a.id = o.account_id
        left join refunds r on r.order_id = o.id
        where o.buyer_user_id = ${userId} and o.status in ('paid', 'refunded', 'chargeback') and o.env = 'live'
          and (${restricted}::uuid is null or o.id = ${restricted})
        order by o.paid_at desc limit 20`,
    );
    const now = this.deps.now().getTime();
    return rows.map((o) => ({
      order_number: o.number,
      product: o.product_name,
      seller: o.seller_name,
      seller_contact: o.support_contact,
      status: o.status,
      paid_at: o.paid_at ? (o.paid_at as Date).toISOString() : null,
      payment: o.method === "card" ? (o.installments > 1 ? `cartão em ${o.installments}x` : "cartão") : o.method,
      total: formatBRL(o.buyer_total_cents),
      has_access: o.has_access,
      guarantee_days_left: o.status === "paid" && o.guarantee_until ? Math.max(0, Math.ceil((o.guarantee_until.getTime() - now) / DAY_MS)) : 0,
      refund: o.refund_id ? { status: REFUND_STATUS[o.refund_status] ?? o.refund_status, href: `/reembolso/${o.refund_id}` } : null,
    }));
  }

  /** Reenvia o link de acesso para o e-mail do cadastro. No máximo 2 por resposta. */
  async resendAccess(orderNumber: number): Promise<string> {
    const { userId, restricted } = this.who;
    if (this.resent >= 2) return "Limite de reenvios desta conversa atingido.";
    return this.system(async (tx) => {
      const [order] = await tx`
        select o.id, o.status, o.product_id, p.name as product_name, u.name, u.email
        from orders o join products p on p.id = o.product_id join users u on u.id = o.buyer_user_id
        where o.number = ${orderNumber} and o.buyer_user_id = ${userId} and (${restricted}::uuid is null or o.id = ${restricted})`;
      if (!order) return "Compra não encontrada para esta pessoa.";
      if (order.status !== "paid") return "Esta compra não está ativa (foi reembolsada ou contestada), então não há acesso para reenviar.";
      const link = await createMagicLink(tx, this.deps.config, { userId, redirectTo: `/assistir/${order.product_id}`, ttlMinutes: 7 * 24 * 60 });
      await enqueueEmail(tx, order.email, "access_granted", { name: (order.name as string).split(" ")[0], product: order.product_name, link });
      this.resent += 1;
      this.card({ type: "access_sent", product: order.product_name });
      this.card({ type: "link", label: "Abrir minhas compras", href: "/compras" });
      return `Link de acesso reenviado para o e-mail do cadastro (${maskEmail(order.email)}).`;
    });
  }

  /** Encaminha para uma pessoa da equipe, com o resumo do caso. Um pedido por resposta. */
  async openTicket(input: { topic: "access" | "payment" | "refund" | "other"; summary: string; orderNumber?: number | null }): Promise<string> {
    const { userId, restricted } = this.who;
    if (this.ticketOpened) return "Já foi aberto um pedido nesta resposta.";
    return this.system(async (tx) => {
      const [open] = await tx`select count(*) as n from support_tickets where user_id = ${userId} and status = 'open'`;
      if (open!.n >= 5) return "A pessoa já tem 5 pedidos em aberto; é preciso aguardar a resposta deles antes de abrir outro.";
      let orderId: string | null = null;
      if (input.orderNumber != null) {
        const [order] = await tx`select id from orders where number = ${input.orderNumber} and buyer_user_id = ${userId} and (${restricted}::uuid is null or id = ${restricted})`;
        orderId = order?.id ?? null;
      }
      const [ticket] = await tx`
        insert into support_tickets (user_id, order_id, topic, message, due_at, source)
        values (${userId}, ${orderId}, ${input.topic}, ${input.summary.slice(0, 2000)}, ${this.nextBusinessDay(this.deps.now())}, 'assistant')
        returning number, due_at`;
      this.ticketOpened = true;
      this.card({ type: "ticket", number: ticket!.number, due_at: (ticket!.due_at as Date).toISOString() });
      return `Pedido #${ticket!.number} aberto. Uma pessoa responde até ${(ticket!.due_at as Date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}, por e-mail e na página de Ajuda.`;
    });
  }

  /** Botões que ajudam a pessoa a resolver sozinha. */
  suggest(target: "purchases" | "refund" | "verify_link" | "human", refundHref?: string) {
    const links = {
      purchases: { label: "Abrir minhas compras", href: "/compras" },
      refund: { label: "Acompanhar reembolso", href: refundHref ?? "/compras" },
      verify_link: { label: "Verificar um link", href: "/verificar-link" },
      human: { label: "Falar com uma pessoa", href: "/ajuda#pessoa" },
    };
    this.card({ type: "link", ...links[target] });
  }
}

const maskEmail = (email: string) => {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
};

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Respostas prontas, usadas quando não há chave de IA configurada ou o modelo falha. */
export async function answerLocal(message: string, tools: BuyerTools): Promise<AssistantReply> {
  const text = plain(message);
  const has = (re: RegExp) => re.test(text);
  const purchases = await tools.listPurchases();
  const active = purchases.filter((p) => p.status === "paid");
  const done = (reply: string): AssistantReply => ({ reply, cards: tools.cards, source: "local" });

  if (has(/\b(pessoa|humano|atendente|alguem|gente de verdade)\b/)) {
    const result = await tools.openTicket({ topic: "other", summary: message });
    return done(result.startsWith("Pedido") ? `Certo, encaminhei para a equipe. ${result}` : result);
  }
  if (has(/nao reconhec|fraude|golpe|clonad|cobranca indevida|cobrado duas|cobrada duas/)) {
    tools.suggest("purchases");
    tools.suggest("human");
    return done("Vamos resolver. Primeiro confira em Minhas compras se o pedido aparece no seu nome. Se não aparecer, ou se foi cobrado duas vezes, fale com uma pessoa e informe a data e o valor da cobrança.");
  }
  if (has(/link (estranho|falso|suspeito)|e verdadeiro|confiavel|e seguro/)) {
    tools.suggest("verify_link");
    return done("Antes de pagar, confira se o link é mesmo do Domma Mart pelo botão abaixo.");
  }
  if (has(/reembols|devol|estorn|dinheiro de volta|cancelar|arrepend/)) {
    const withRefund = purchases.find((p) => p.refund);
    if (withRefund?.refund) {
      tools.suggest("refund", withRefund.refund.href);
      return done(`Seu reembolso de "${withRefund.product}" está assim: ${withRefund.refund.status}. Dá para acompanhar cada passo pelo botão abaixo.`);
    }
    tools.suggest("purchases");
    if (active.length === 0) return done("Não encontrei compra ativa neste cadastro. Se você comprou com outro e-mail, celular ou CPF, entre com ele para pedir o reembolso.");
    const lines = active.slice(0, 3).map((p) => `"${p.product}": ${p.guarantee_days_left > 0 ? `garantia por mais ${p.guarantee_days_left} ${p.guarantee_days_left === 1 ? "dia" : "dias"}, reembolso na hora` : "garantia encerrada, o produtor decide em até 5 dias úteis"}`);
    return done(`Você pede o reembolso em Minhas compras, no botão "Pedir reembolso". ${lines.join(". ")}. O Pix volta no mesmo dia; no cartão, o estorno aparece na fatura.`);
  }
  if (has(/acess|entrar|login|nao recebi|nao chegou|link|assistir|aula|senha|e-?mail/)) {
    if (active.length === 0) {
      tools.suggest("purchases");
      return done("Não encontrei compra ativa neste cadastro. O acesso aparece em Minhas compras assim que o pagamento é confirmado. Se você comprou com outro e-mail, celular ou CPF, entre com ele.");
    }
    const result = await tools.resendAccess(active[0]!.order_number);
    return done(`${result} O acesso a "${active[0]!.product}" também está em Minhas compras, sem precisar de senha.`);
  }
  if (has(/pix|cartao|boleto|parcel|pagamento|paguei|fatura|cobranc/)) {
    tools.suggest("purchases");
    return done("O Pix é confirmado em poucos segundos e o cartão na hora; assim que confirma, o acesso aparece em Minhas compras. Se o Pix venceu sem pagamento, é só gerar outro no link de compra. No cartão parcelado, os juros aparecem antes de você pagar.");
  }
  tools.suggest("purchases");
  tools.suggest("human");
  return done("Posso ajudar com acesso ao produto, pagamento e reembolso. Conte o que aconteceu com um pouco mais de detalhe, ou fale com uma pessoa da equipe: a resposta sai em até 1 dia útil. Dúvidas sobre o conteúdo do curso são com o produtor.");
}

/** Gera a resposta: com o modelo quando há chave configurada; senão, com as respostas prontas. */
export async function answerBuyer(deps: Deps, tools: BuyerTools, history: { role: "user" | "assistant"; content: string }[], message: string): Promise<AssistantReply> {
  if (deps.config.anthropicApiKey) {
    try {
      const { answerWithModel } = await import("./assistant-model.ts");
      return await answerWithModel(deps.config.anthropicApiKey, deps.now(), tools, history, message);
    } catch (err) {
      console.error("[assistente] o modelo falhou; usando as respostas prontas:", err);
    }
  }
  return answerLocal(message, tools);
}
