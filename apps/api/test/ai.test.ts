import { describe, expect, it } from "vitest";
import { localProductDraft, triageProduct } from "../src/services/ai.ts";

describe("gerador local de produto (sem chave de IA)", () => {
  it("curso com material de apoio continua sendo curso e respeita o número de aulas", () => {
    const draft = localProductDraft("Um curso em vídeo sobre confeitaria para iniciantes, com 12 aulas gravadas e receitas em PDF.");
    expect(draft.type).toBe("course");
    expect(draft.name).toBe("Curso: Confeitaria para iniciantes");
    expect(draft.modules.reduce((a, m) => a + m.lessons.length, 0)).toBe(12);
    expect(draft.price_cents).toBe(19700);
  });
  it("reconhece arquivo e mentoria", () => {
    expect(localProductDraft("Uma planilha de controle financeiro para autônomos").type).toBe("file");
    expect(localProductDraft("Mentoria individual de carreira em 4 sessões").type).toBe("service");
  });
});

describe("triagem de produtos (M07)", () => {
  it.each([
    ["Método de renda garantida em 7 dias", "Ganhe todo dia.", "reject"],
    ["Grupo de sinais", "Sinais de apostas esportivas todos os dias com alta assertividade.", "reject"],
    ["Pack de cursos", "Rateio dos melhores cursos de marketing do mercado.", "reject"],
    ["Mentoria de emagrecimento", "Acompanhamento em grupo para emagrecer com hábitos simples.", "doubt"],
    ["Curso de vendas", "Aprenda a faturar 10 mil reais em 30 dias com o meu método.", "doubt"],
    ["Curso de confeitaria para iniciantes", "Aprenda a fazer bolos e doces com receitas testadas, do básico ao avançado.", "approve"],
  ])("%s -> %s", (name, description, expected) => {
    expect(triageProduct({ name, description }).triage).toBe(expected);
  });
});
