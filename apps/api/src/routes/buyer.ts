import type { Tx } from "@domma/db";
import { z } from "zod";
import type { Deps } from "../lib/deps.ts";
import { forbidden, notFound, unprocessable } from "../lib/errors.ts";
import type { RateLimiter } from "../lib/rate-limit.ts";
import type { Auth, Router } from "../lib/router.ts";
import { BuyerTools, answerBuyer } from "../services/assistant.ts";
import { executeRefund } from "../services/sales.ts";
import { uuidOr404 } from "./seller.ts";

const DAY_MS = 86_400_000;

function session(auth: Auth | null) {
  if (auth?.kind !== "session") throw forbidden();
  return { userId: auth.user.id, restricted: auth.restrictedOrderId };
}

export function buyerRoutes(r: Router, deps: Deps, limiter: RateLimiter) {
  // ── Minhas compras (C05)

  r.get("/v1/buyer/purchases", { access: "user", tag: "Comprador", summary: "Minhas compras: tudo o que a pessoa precisa em um só lugar" }, async ({ auth, system }) => {
    const { userId, restricted } = session(auth);
    const rows = await system((tx) => tx`
      select o.id as order_id, o.number, o.status, o.method, o.installments, o.buyer_total_cents, o.card_last4, o.paid_at, o.guarantee_until,
             i.kind as item_kind, i.price_cents, p.id as product_id, p.name as product_name, p.cover_url, p.type as product_type,
             p.support_contact, a.name as seller_name, e.status as access_status, r.id as refund_id, r.status as refund_status,
             (select count(*) from lessons l where l.product_id = p.id) as lessons_total,
             (select count(*) from lesson_progress lp join lessons l on l.id = lp.lesson_id
               where l.product_id = p.id and lp.user_id = ${userId} and lp.completed_at is not null) as lessons_done
      from orders o
      join order_items i on i.order_id = o.id
      join products p on p.id = i.product_id
      join accounts a on a.id = o.account_id
      left join enrollments e on e.order_id = o.id and e.product_id = p.id
      left join refunds r on r.order_id = o.id
      where o.buyer_user_id = ${userId} and o.status in ('paid', 'refunded') and o.env = 'live'
        and (${restricted}::uuid is null or o.id = ${restricted})
      order by o.paid_at desc, i.kind`);
    const now = deps.now().getTime();
    return {
      data: rows.map((row) => ({
        ...row,
        can_access: row.access_status === "active",
        guarantee_days_left: row.status === "paid" && row.guarantee_until ? Math.max(0, Math.ceil((row.guarantee_until.getTime() - now) / DAY_MS)) : 0,
        // Reembolso é do pedido inteiro; o botão aparece no item principal.
        can_request_refund: row.status === "paid" && row.item_kind === "main" && !row.refund_id,
      })),
      restricted: Boolean(restricted),
    };
  });

  r.post(
    "/v1/buyer/orders/:id/refund",
    {
      access: "user",
      tag: "Comprador",
      summary: "Pedir reembolso. Dentro da garantia é automático; fora dela, o produtor decide.",
      idempotent: true,
      body: z.object({ reason: z.string().trim().max(500).optional() }),
    },
    async ({ params, body, auth, system }) => {
      const { userId, restricted } = session(auth);
      const orderId = uuidOr404(params.id!);
      if (restricted && restricted !== orderId) throw notFound("Compra");
      const order = await system(async (tx) => (await tx`select id, account_id, status, guarantee_until, buyer_total_cents from orders where id = ${orderId} and buyer_user_id = ${userId}`)[0]);
      if (!order) throw notFound("Compra");
      if (order.status !== "paid") throw unprocessable("order_not_paid", "Esta compra não pode ser reembolsada.");

      if (order.guarantee_until && order.guarantee_until >= deps.now()) {
        const refundId = await executeRefund(deps, { orderId, kind: "within_guarantee", reason: body.reason, requestedBy: userId });
        return { refund_id: refundId, automatic: true };
      }
      const refundId = await system(async (tx) => {
        const [existing] = await tx`select id from refunds where order_id = ${orderId}`;
        if (existing) return existing.id as string;
        const [row] = await tx`
          insert into refunds (account_id, order_id, buyer_user_id, amount_cents, reason, kind, status, requested_by)
          values (${order.account_id}, ${orderId}, ${userId}, ${order.buyer_total_cents}, ${body.reason ?? null}, 'producer_decision', 'requested', ${userId})
          returning id`;
        await tx`insert into refund_events (account_id, refund_id, step, message)
                 values (${order.account_id}, ${row!.id}, 'requested', 'Recebemos o seu pedido. Como o prazo de garantia já passou, o produtor é quem decide.')`;
        return row!.id as string;
      });
      return { refund_id: refundId, automatic: false };
    },
  );

  // ── Acompanhar reembolso (C07)

  r.get("/v1/buyer/refunds/:id", { access: "user", tag: "Comprador", summary: "Linha do tempo do reembolso: o que já aconteceu e qual é o próximo passo" }, async ({ params, auth, system }) => {
    const { userId, restricted } = session(auth);
    return system(async (tx) => {
      const [refund] = await tx`
        select r.id, r.status, r.kind, r.amount_cents, r.refund_ref, r.created_at, o.id as order_id, o.method, o.installments, o.card_last4,
               p.name as product_name, p.cover_url
        from refunds r join orders o on o.id = r.order_id join products p on p.id = o.product_id
        where r.id = ${uuidOr404(params.id!)} and r.buyer_user_id = ${userId} and (${restricted}::uuid is null or o.id = ${restricted})`;
      if (!refund) throw notFound("Reembolso");
      const events = await tx`select step, message, created_at from refund_events where refund_id = ${refund.id} order by seq`;
      // A tela nunca mostra só "processado": sempre diz o próximo passo e de quem ele depende.
      const next =
        refund.status === "requested"
          ? { step: "approved", title: "Decisão do produtor", message: "O produtor responde em até 5 dias úteis. Avisamos você por e-mail.", depends_on: "produtor" }
          : refund.status === "approved"
            ? { step: "sent", title: "Devolução", message: "Estamos enviando a devolução. Costuma levar poucos minutos.", depends_on: "Domma Mart" }
            : refund.status === "sent"
              ? { step: "available", title: "Aparece na sua fatura", message: "Previsão: na próxima fatura ou na seguinte. O prazo depende do banco do seu cartão.", depends_on: "banco do cartão" }
              : null;
      return {
        ...refund,
        events,
        next,
        done: refund.status === "completed",
        support: { message: "Uma pessoa responde em até 1 dia útil.", response_time_business_days: 1 },
      };
    });
  });

  // ── Área de membros (C06)

  r.get("/v1/buyer/products/:id/content", { access: "user", tag: "Comprador", summary: "Conteúdo do produto comprado: módulos, aulas e progresso" }, async ({ params, auth, system }) => {
    const { userId, restricted } = session(auth);
    return system(async (tx) => {
      const [enrollment] = await tx`
        select e.granted_at, p.id, p.name, p.description, p.cover_url, p.type, p.delivery_url, a.name as seller_name
        from enrollments e join products p on p.id = e.product_id join accounts a on a.id = p.account_id
        where e.product_id = ${uuidOr404(params.id!)} and e.user_id = ${userId} and e.status = 'active'
          and (${restricted}::uuid is null or e.order_id = ${restricted})`;
      if (!enrollment) throw notFound("Conteúdo");
      const modules = await tx`select id, title, position from modules where product_id = ${enrollment.id} order by position`;
      const lessons = await tx`
        select l.id, l.module_id, l.title, l.description, l.video_url, l.duration_seconds, l.position, l.release_after_days, l.release_at, l.materials,
               lp.completed_at, coalesce(lp.position_seconds, 0) as position_seconds
        from lessons l left join lesson_progress lp on lp.lesson_id = l.id and lp.user_id = ${userId}
        where l.product_id = ${enrollment.id} order by l.position`;
      const now = deps.now();
      const withLock = lessons.map((l): Record<string, any> => {
        const byDays = new Date(enrollment.granted_at.getTime() + l.release_after_days * DAY_MS);
        const unlockAt = l.release_at && l.release_at > byDays ? l.release_at : byDays;
        const locked = unlockAt > now;
        // Aula bloqueada mostra a data de liberação e nunca entrega o vídeo nem os materiais.
        return { ...l, locked, unlock_at: locked ? unlockAt : null, video_url: locked ? null : l.video_url, materials: locked ? [] : l.materials, completed: Boolean(l.completed_at) };
      });
      return {
        product: { id: enrollment.id, name: enrollment.name, description: enrollment.description, cover_url: enrollment.cover_url, type: enrollment.type, seller_name: enrollment.seller_name },
        modules: modules.map((m) => ({ ...m, lessons: withLock.filter((l) => l.module_id === m.id) })),
        progress: { total: withLock.length, done: withLock.filter((l) => l.completed).length },
      };
    });
  });

  r.post(
    "/v1/buyer/lessons/:id/progress",
    {
      access: "user",
      tag: "Comprador",
      summary: "Marcar aula como concluída e lembrar o ponto em que a pessoa parou",
      body: z.object({ completed: z.boolean().optional(), position_seconds: z.number().int().min(0).max(86_400).optional() }),
    },
    async ({ params, body, auth, system }) => {
      const { userId, restricted } = session(auth);
      return system(async (tx) => {
        const [lesson] = await tx`
          select l.id, l.account_id from lessons l join enrollments e on e.product_id = l.product_id
          where l.id = ${uuidOr404(params.id!)} and e.user_id = ${userId} and e.status = 'active' and (${restricted}::uuid is null or e.order_id = ${restricted})`;
        if (!lesson) throw notFound("Aula");
        await tx`
          insert into lesson_progress (user_id, lesson_id, account_id, position_seconds, completed_at)
          values (${userId}, ${lesson.id}, ${lesson.account_id}, ${body.position_seconds ?? 0}, ${body.completed ? deps.now() : null})
          on conflict (user_id, lesson_id) do update set
            position_seconds = coalesce(${body.position_seconds ?? null}, lesson_progress.position_seconds),
            completed_at = case when ${body.completed ?? null}::boolean is null then lesson_progress.completed_at
                                when ${body.completed ?? null}::boolean then coalesce(lesson_progress.completed_at, now()) else null end,
            updated_at = now()`;
        return { ok: true };
      });
    },
  );

  // ── Atendimento humano, com prazo de resposta visível

  r.get("/v1/buyer/support", { access: "user", tag: "Comprador", summary: "Meus pedidos de atendimento e o prazo de cada um" }, async ({ auth, system }) => {
    const { userId } = session(auth);
    return {
      data: await system((tx) => tx`
        select t.id, t.number, t.topic, t.message, t.status, t.answer, t.answered_at, t.due_at, t.created_at, p.name as product_name
        from support_tickets t left join orders o on o.id = t.order_id left join products p on p.id = o.product_id
        where t.user_id = ${userId} order by t.created_at desc limit 50`),
    };
  });

  r.post(
    "/v1/buyer/support",
    {
      access: "user",
      tag: "Comprador",
      summary: "Falar com uma pessoa. A resposta sai em até 1 dia útil.",
      idempotent: true,
      body: z.object({ topic: z.enum(["access", "payment", "refund", "other"]), message: z.string().trim().min(10, "Conte um pouco mais para a gente conseguir ajudar").max(2000), order_id: z.uuid().optional() }),
    },
    async ({ body, auth, system }) => {
      const { userId, restricted } = session(auth);
      return system(async (tx) => {
        if (body.order_id) {
          const [order] = await tx`select 1 from orders where id = ${body.order_id} and buyer_user_id = ${userId} and (${restricted}::uuid is null or id = ${restricted})`;
          if (!order) throw notFound("Compra");
        }
        const [open] = await tx`select count(*) as n from support_tickets where user_id = ${userId} and status = 'open'`;
        if (open!.n >= 5) throw unprocessable("too_many_tickets", "Você já tem pedidos em aberto. Assim que respondermos, pode enviar outro.");
        const [ticket] = await tx`
          insert into support_tickets (user_id, order_id, topic, message, due_at)
          values (${userId}, ${body.order_id ?? null}, ${body.topic}, ${body.message}, ${nextBusinessDay(deps.now())})
          returning id, number, due_at`;
        return ticket;
      });
    },
  );

  // ── Assistente de atendimento (IA): resolve o que é comum na hora e encaminha o resto para uma pessoa

  const conversationOf = async (tx: Tx, userId: string) => {
    const [c] = await tx`select id from assistant_conversations where user_id = ${userId} and status = 'open' order by created_at desc limit 1`;
    return (c?.id as string | undefined) ?? null;
  };

  r.get("/v1/buyer/assistant", { access: "user", tag: "Comprador", summary: "Conversa em andamento com a assistente de atendimento" }, async ({ auth, system }) => {
    const { userId } = session(auth);
    return system(async (tx) => {
      const id = await conversationOf(tx, userId);
      return {
        conversation_id: id,
        // Sem chave de IA configurada, a assistente responde com as respostas prontas.
        ai: Boolean(deps.config.anthropicApiKey),
        messages: id ? await tx`select id, role, content, cards, created_at from assistant_messages where conversation_id = ${id} order by seq` : [],
      };
    });
  });

  r.post(
    "/v1/buyer/assistant/messages",
    {
      access: "user",
      tag: "Comprador",
      summary: "Enviar uma mensagem para a assistente. Ela consulta as compras da pessoa, reenvia acesso e encaminha para a equipe quando precisa.",
      body: z.object({ message: z.string().trim().min(2, "Escreva a sua dúvida").max(1500) }),
    },
    async ({ body, auth, system }) => {
      const { userId, restricted } = session(auth);
      limiter.check(`assistant:${userId}`, 30, 60 * 60_000);
      const { conversationId, history } = await system(async (tx) => {
        let id = await conversationOf(tx, userId);
        if (!id) id = (await tx`insert into assistant_conversations (user_id) values (${userId}) returning id`)[0]!.id as string;
        const [count] = await tx`select count(*) as n from assistant_messages where conversation_id = ${id}`;
        if (count!.n >= 60) throw unprocessable("conversation_too_long", "Esta conversa ficou longa. Comece uma nova para continuar.");
        const previous = await tx`select role, content from (select role, content, seq from assistant_messages where conversation_id = ${id} order by seq desc limit 20) t order by seq`;
        await tx`insert into assistant_messages (conversation_id, user_id, role, content) values (${id}, ${userId}, 'user', ${body.message})`;
        return { conversationId: id, history: previous as unknown as { role: "user" | "assistant"; content: string }[] };
      });
      // O histórico enviado ao modelo precisa começar por uma mensagem da pessoa.
      const firstUser = history.findIndex((m) => m.role === "user");
      const tools = new BuyerTools(deps, system, { userId, restricted }, nextBusinessDay);
      const answer = await answerBuyer(deps, tools, firstUser < 0 ? [] : history.slice(firstUser), body.message);
      const [saved] = await system(
        (tx) => tx`
          insert into assistant_messages (conversation_id, user_id, role, content, cards, source)
          values (${conversationId}, ${userId}, 'assistant', ${answer.reply}, ${tx.json(answer.cards as never)}, ${answer.source})
          returning id, role, content, cards, created_at`,
      );
      return { conversation_id: conversationId, message: saved };
    },
  );

  r.post("/v1/buyer/assistant/reset", { access: "user", tag: "Comprador", summary: "Encerrar a conversa com a assistente e começar outra" }, async ({ auth, system }) => {
    const { userId } = session(auth);
    await system((tx) => tx`update assistant_conversations set status = 'closed' where user_id = ${userId} and status = 'open'`);
    return { ok: true };
  });

  r.post(
    "/v1/buyer/products/:id/report",
    { access: "user", tag: "Comprador", summary: "Denunciar produto", body: z.object({ reason: z.string().trim().min(5).max(1000) }) },
    async ({ params, body, auth, system }) => {
      const { userId } = session(auth);
      await system(async (tx) => {
        const [e] = await tx`select account_id from enrollments where product_id = ${uuidOr404(params.id!)} and user_id = ${userId} limit 1`;
        if (!e) throw notFound("Produto");
        await tx`insert into product_reports (account_id, product_id, reporter_user_id, reason) values (${e.account_id}, ${params.id!}, ${userId}, ${body.reason})`;
      });
      return { ok: true };
    },
  );
}

/** Fim do próximo dia útil (segunda a sexta), no horário de Brasília. Feriados ainda não são considerados. */
export function nextBusinessDay(from: Date): Date {
  const BRT = 3 * 3_600_000;
  const local = new Date(from.getTime() - BRT);
  do local.setUTCDate(local.getUTCDate() + 1);
  while (local.getUTCDay() === 0 || local.getUTCDay() === 6);
  local.setUTCHours(18, 0, 0, 0);
  return new Date(local.getTime() + BRT);
}
