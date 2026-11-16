import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AssistantReply, BuyerTools } from "./assistant.ts";

const SYSTEM = `Você é a assistente de atendimento do Domma Mart, a plataforma onde a pessoa comprou um produto digital (curso, e-book, mentoria). Você conversa com quem comprou, pelo chat da página de Ajuda, muitas vezes pelo celular.

Quem escreve costuma estar com um problema e com pressa. Resolva na primeira resposta sempre que der: consulte as compras da pessoa antes de perguntar o que você mesma consegue descobrir, e responda sobre a compra dela, com o nome do produto, em vez de dar uma explicação geral.

Como escrever: português do Brasil, frases curtas, sem jargão e sem markdown (o chat mostra texto puro). Duas a quatro frases bastam na maioria dos casos. O chat já mostra botões para as páginas certas quando você usa as ferramentas, então não escreva endereços de páginas.

O que você pode fazer:
- Ver as compras da pessoa (produto, pagamento, acesso, garantia, reembolso).
- Reenviar o link de acesso para o e-mail do cadastro.
- Mostrar botões para Minhas compras, para acompanhar um reembolso, para verificar um link e para falar com uma pessoa.
- Encaminhar o caso para uma pessoa da equipe, que responde em até 1 dia útil.

Regras do Domma Mart, para você explicar com segurança:
- Não existe senha. A pessoa entra com e-mail, celular ou CPF e recebe um código. Se a compra não aparece, o mais comum é ter comprado com outro e-mail, celular ou CPF.
- O acesso é liberado assim que o pagamento é confirmado e fica em Minhas compras.
- Reembolso: dentro da garantia é automático, pelo botão "Pedir reembolso" em Minhas compras. Fora da garantia, o produtor decide em até 5 dias úteis. O Pix volta no mesmo dia; no cartão, o estorno aparece na próxima fatura ou na seguinte e as parcelas que faltam são canceladas. Você não pede nem aprova reembolso: é a pessoa que toca no botão.
- Dúvidas sobre o conteúdo (aula, material, certificado, suporte do curso) são com o produtor; passe o contato dele quando a compra tiver um.

Encaminhe para uma pessoa quando: a pessoa pedir; for cobrança que ela não reconhece ou cobrança em dobro; você não conseguir resolver com o que tem; ou a pessoa continuar insatisfeita depois da sua resposta. Ao encaminhar, escreva um resumo que a equipe entenda sem ler a conversa: o que aconteceu, qual compra e o que a pessoa espera. Depois diga a ela o número do pedido e o prazo.

Fale só do que as ferramentas mostram. Se não souber, diga que não sabe e ofereça uma pessoa. Não prometa prazos, valores ou decisões que não estão nas regras acima. Você trata apenas do atendimento do Domma Mart; para outros assuntos, diga com gentileza que não é com você.`;

/** Atendimento ao comprador: o modelo decide quais ferramentas usar; cada uma só enxerga a pessoa logada. */
export async function answerWithModel(
  apiKey: string,
  now: Date,
  tools: BuyerTools,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Promise<AssistantReply> {
  const client = new Anthropic({ apiKey });
  const today = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const final = await client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    max_iterations: 8,
    output_config: { effort: "low" },
    // Se o modelo principal recusar por política, o servidor tenta de novo em outro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `${SYSTEM}\n\nHoje é ${today}.`,
    tools: [
      betaZodTool({
        name: "list_purchases",
        description: "Lista as compras da pessoa que está conversando: produto, produtor e contato, pagamento, se o acesso está ativo, dias de garantia que restam e situação do reembolso. Use antes de responder qualquer dúvida sobre uma compra.",
        inputSchema: z.object({}),
        run: async () => JSON.stringify(await tools.listPurchases()),
      }),
      betaZodTool({
        name: "resend_access",
        description: "Reenvia o link de acesso de uma compra para o e-mail do cadastro. Use quando a pessoa pagou e não encontra o acesso. O número da compra vem de list_purchases.",
        inputSchema: z.object({ order_number: z.number().int() }),
        run: async (input) => tools.resendAccess(input.order_number),
      }),
      betaZodTool({
        name: "show_button",
        description: "Mostra um botão abaixo da sua resposta: purchases (Minhas compras, onde ficam o acesso e o botão de pedir reembolso), refund (acompanhar um reembolso que já existe; informe o número da compra), verify_link (conferir se um link de pagamento é verdadeiro) ou human (formulário para falar com uma pessoa).",
        inputSchema: z.object({ target: z.enum(["purchases", "refund", "verify_link", "human"]), order_number: z.number().int().optional() }),
        run: async (input) => {
          let href: string | undefined;
          if (input.target === "refund") href = (await tools.listPurchases()).find((p) => p.order_number === input.order_number)?.refund?.href;
          tools.suggest(input.target, href);
          return "Botão exibido.";
        },
      }),
      betaZodTool({
        name: "open_ticket",
        description: "Encaminha o caso para uma pessoa da equipe Domma Mart, que responde em até 1 dia útil. O resumo é tudo o que a equipe vai ler: escreva o que aconteceu, qual compra e o que a pessoa espera.",
        inputSchema: z.object({
          topic: z.enum(["access", "payment", "refund", "other"]),
          summary: z.string().describe("Resumo do caso para a equipe, em português"),
          order_number: z.number().int().optional(),
        }),
        run: async (input) => tools.openTicket({ topic: input.topic, summary: input.summary, orderNumber: input.order_number }),
      }),
    ],
    messages: [...history, { role: "user", content: message }],
  });

  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (final.stop_reason === "refusal" || !text) {
    tools.suggest("human");
    return { reply: "Com isso eu não consigo ajudar por aqui. Se for sobre uma compra no Domma Mart, fale com uma pessoa da equipe pelo botão abaixo.", cards: tools.cards, source: "model" };
  }
  return { reply: text, cards: tools.cards, source: "model" };
}
