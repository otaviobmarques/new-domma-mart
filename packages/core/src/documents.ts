export const onlyDigits = (value: string) => value.replace(/\D/g, "");

function allSame(digits: string) {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 11 || allSame(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 14 || allSame(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidDocument(input: string): boolean {
  const d = onlyDigits(input);
  return d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false;
}

export function formatCpf(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function formatPhone(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Celular brasileiro com DDD: 10 ou 11 dígitos. */
export function isValidPhone(input: string): boolean {
  const d = onlyDigits(input);
  return (d.length === 10 || d.length === 11) && !allSame(d) && Number(d.slice(0, 2)) >= 11;
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim()) && input.length <= 254;
}

export type IdentifierKind = "email" | "phone" | "cpf";

/** Descobre o que o comprador digitou no campo único de entrada (tela C04). */
export function classifyIdentifier(input: string): { kind: IdentifierKind; value: string } | null {
  const raw = input.trim();
  if (raw.includes("@")) return isValidEmail(raw) ? { kind: "email", value: normalizeEmail(raw) } : null;
  const d = onlyDigits(raw);
  if (d.length === 11 && isValidCpf(d)) return { kind: "cpf", value: d };
  if (isValidPhone(d)) return { kind: "phone", value: d };
  return null;
}

/** "marina@email.com" -> "ma•••@email.com" — para avisos sem expor o dado completo. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}

export function maskPhone(phone: string): string {
  const d = onlyDigits(phone);
  return `(${d.slice(0, 2)}) •••••-${d.slice(-4)}`;
}
