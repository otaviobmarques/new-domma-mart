import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ProductDraft } from "./ai.ts";

const DraftSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(["course", "file", "community", "service", "event", "subscription"]),
  price_reais: z.number(),
  modules: z.array(z.object({ title: z.string(), lessons: z.array(z.object({ title: z.string() })) })),
});

const SYSTEM = `Você ajuda produtores brasileiros a colocar um produto digital à venda no Domma Mart.
A partir da descrição do produtor, proponha o cadastro do produto. O produtor vai revisar e aprovar tudo antes de publicar.

- name: nome comercial claro, até 70 caracteres, sem emojis.
- description: 2 a 4 frases em linguagem simples dizendo o que a pessoa aprende ou recebe. Use só o que o produtor informou.
  Nunca prometa ganho, resultado garantido, cura ou prazo para resultado — produtos assim são recusados na análise.
- type: course (curso em vídeo), file (e-book, planilha, arquivo), community, service (mentoria), event ou subscription.
- price_reais: preço sugerido em reais, coerente com o mercado brasileiro para esse tipo de produto.
- modules: para cursos, a estrutura de módulos e aulas com títulos específicos do assunto, respeitando a quantidade de aulas
  que o produtor citar. Para os outros tipos, lista vazia.`;

/** Criador de produto (capítulo 8): gera a proposta com o modelo de linguagem. */
export async function modelProductDraft(apiKey: string, description: string): Promise<ProductDraft> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(DraftSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: description }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error(`O modelo não gerou a proposta (${response.stop_reason})`);
  const draft = response.parsed_output;
  return {
    name: draft.name.slice(0, 120),
    description: draft.description.slice(0, 5000),
    type: draft.type,
    price_cents: Math.min(10_000_000, Math.max(100, Math.round(draft.price_reais * 100))),
    guarantee_days: 7,
    modules: draft.modules.slice(0, 50).map((m) => ({ title: m.title.slice(0, 120), lessons: m.lessons.slice(0, 200).map((l) => ({ title: l.title.slice(0, 160) })) })),
    source: "model",
  };
}
