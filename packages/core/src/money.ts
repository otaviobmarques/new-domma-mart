/** Todo valor monetário do sistema é um inteiro em centavos. Nunca use ponto flutuante para dinheiro. */
export type Cents = number;

/** Pontos-base: 399 = 3,99%. */
export type Bps = number;

export function assertCents(value: number, label = "valor"): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} precisa ser um inteiro em centavos`);
  return value;
}

/** Aplica um percentual em pontos-base, arredondando meio centavo para cima. */
export function percentOf(amount: Cents, bps: Bps): Cents {
  assertCents(amount);
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(amount) * bps + 5000) / 10000);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 19700 -> "R$ 197,00" */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** 399 -> "3,99%" */
export function formatBps(bps: Bps): string {
  return `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** "197,00" | "197.5" | "R$ 1.234,56" -> centavos. Retorna null se não for um valor válido. */
export function parseBRL(input: string): Cents | null {
  const cleaned = input.replace(/[R$\s]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", frac = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
