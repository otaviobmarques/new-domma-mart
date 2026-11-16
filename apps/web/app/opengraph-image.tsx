import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Domma Mart — venda seu produto digital e fique com mais do que é seu";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "Plataforma de infoprodutos",
    title: "Venda seu produto digital e fique com",
    highlight: "mais do que é seu.",
    footer: [
      { value: "3,99% + R$ 1,49", label: "no cartão" },
      { value: "R$ 1,49", label: "fixo no Pix" },
      { value: "R$ 0", label: "para sacar" },
    ],
  });
}
