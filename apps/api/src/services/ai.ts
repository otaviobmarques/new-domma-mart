import type { Config } from "../env.ts";

export interface ProductDraft {
  name: string;
  description: string;
  type: "course" | "file" | "community" | "service" | "event" | "subscription";
  price_cents: number;
  guarantee_days: number;
  modules: { title: string; lessons: { title: string }[] }[];
  /** Quem gerou: "modelo" (IA) ou "local" (gerador simples, sem IA). */
  source: "model" | "local";
}

export interface Triage {
  triage: "approve" | "reject" | "doubt";
  reason: string;
}

const RULES: { pattern: RegExp; triage: "reject" | "doubt"; reason: string }[] = [
  { pattern: /(ganho|renda|lucro|retorno|resultado)s?\s+(garantid|cert[oa])|renda\s+(f[áa]cil|garantida)|dinheiro\s+f[áa]cil|pir[âa]mide|fique\s+rico|enriquec/i, triage: "reject", reason: "Promessa de ganho garantido" },
  { pattern: /\b(apostas?|bets?|cassino|tigrinho|roleta|sinais\s+de|grupo\s+de\s+sinais)\b/i, triage: "reject", reason: "Apostas, jogos de azar ou sinais" },
  { pattern: /(conte[úu]do\s+adulto|\+\s?18|porn[ôo]|onlyfans|er[óo]tic)/i, triage: "reject", reason: "Conteúdo adulto" },
  { pattern: /\b(armas?\s+de\s+fogo|muni[çc][ãa]o|drogas?|documentos?\s+fals|cnh\s+sem|diploma\s+sem)\b/i, triage: "reject", reason: "Armas, drogas ou documentos falsos" },
  { pattern: /\b(pirat|crackead|rateio|cursos?\s+vazad|pack\s+de\s+cursos)/i, triage: "reject", reason: "Pirataria" },
  { pattern: /(lista\s+de\s+(contatos|e-?mails|leads|telefones)|contas?\s+de\s+(instagram|tiktok|facebook)|seguidores\s+(reais|baratos)|dados\s+pessoais)/i, triage: "reject", reason: "Dados pessoais ou contas de redes sociais" },
  { pattern: /\b(cura|curar|emagre[çc]|perca\s+\d+\s*kg|tratamento|rem[ée]dio|suplemento|milagr|detox|horm[ôo]ni)/i, triage: "doubt", reason: "Alegação de saúde precisa de revisão" },
  { pattern: /(em\s+(apenas\s+)?\d+\s+(dias|semanas|horas)).{0,80}(R\$|reais|mil|fatur|ganh|vend)|(R\$|reais|mil|fatur|ganh).{0,80}(em\s+(apenas\s+)?\d+\s+(dias|semanas|horas))/i, triage: "doubt", reason: "Promessa de resultado em prazo fixo" },
];

/**
 * Primeira triagem do produto (M07). Regras simples sobre nome e descrição; a decisão
 * final dos casos recusados ou duvidosos é sempre de uma pessoa do backoffice.
 */
export function triageProduct(input: { name: string; description: string }): Triage {
  const text = `${input.name}\n${input.description}`;
  const hits = RULES.filter((rule) => rule.pattern.test(text));
  const worst = hits.find((h) => h.triage === "reject") ?? hits[0];
  if (worst) return { triage: worst.triage, reason: worst.reason };
  if (input.description.trim().length < 20) return { triage: "doubt", reason: "Descrição muito curta para avaliar" };
  return { triage: "approve", reason: "Conteúdo e descrição coerentes" };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Gerador simples, usado quando não há chave de IA configurada. */
export function localProductDraft(description: string): ProductDraft {
  const text = description.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const type: ProductDraft["type"] = /e-?book|planilha|pdf|arquivo|template|modelo/.test(lower)
    ? "file"
    : /comunidade|grupo|clube/.test(lower)
      ? "community"
      : /mentoria|consultoria|sess[ãõ]/.test(lower)
        ? "service"
        : /evento|ingresso|workshop|imers[ãa]o|ao vivo/.test(lower)
          ? "event"
          : "course";
  const price = { course: 19700, file: 4700, community: 4900, service: 49700, event: 9700, subscription: 4900 }[type];
  const topic =
    lower.match(/(?:sobre|de|para(?:\s+quem\s+quer)?)\s+(.{4,60}?)(?:[,.;]|\s+com\s+|\s+em\s+\d|$)/)?.[1]?.trim() ?? text.split(/[,.;]/)[0]!.slice(0, 60);
  const label = { course: "Curso", file: "Material", community: "Comunidade", service: "Mentoria", event: "Evento", subscription: "Assinatura" }[type];
  const lessonsTotal = Number(lower.match(/(\d+)\s+aulas?/)?.[1] ?? 0);
  const moduleTitles = ["Começando", "Fundamentos", "Na prática", "Próximos passos"];
  const perModule = lessonsTotal ? Math.max(1, Math.ceil(lessonsTotal / moduleTitles.length)) : 3;
  let remaining = lessonsTotal || perModule * moduleTitles.length;
  const modules =
    type === "course"
      ? moduleTitles.map((title, m) => {
          const count = Math.min(perModule, remaining);
          remaining -= count;
          return { title, lessons: Array.from({ length: count }, (_, i) => ({ title: i === 0 && m === 0 ? "Boas-vindas" : `Aula ${i + 1}` })) };
        }).filter((m) => m.lessons.length > 0)
      : [];
  return {
    name: `${label}: ${capitalize(topic)}`.slice(0, 80),
    description: capitalize(text.endsWith(".") ? text : `${text}.`),
    type,
    price_cents: price,
    guarantee_days: 7,
    modules,
    source: "local",
  };
}

export async function generateProductDraft(config: Config, description: string): Promise<ProductDraft> {
  if (config.anthropicApiKey) {
    try {
      const { modelProductDraft } = await import("./ai-model.ts");
      return await modelProductDraft(config.anthropicApiKey, description);
    } catch (err) {
      console.error("[ia] geração pelo modelo falhou; usando o gerador local:", err);
    }
  }
  return localProductDraft(description);
}
