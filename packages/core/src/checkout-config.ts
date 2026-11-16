/** Personalização do checkout de uma oferta (tela P06). Campos obrigatórios e avisos legais não entram aqui: não podem ser removidos. */
export const CHECKOUT_ACCENTS = ["yellow", "green", "blue", "coral", "neutral"] as const;
export type CheckoutAccent = (typeof CHECKOUT_ACCENTS)[number];

export const ACCENT_LABEL: Record<CheckoutAccent, string> = { yellow: "Amarelo", green: "Verde", blue: "Azul", coral: "Coral", neutral: "Neutro" };
/** Cor de amostra de cada opção (a cor real muda um pouco entre o modo claro e o noturno, para manter a leitura). */
export const ACCENT_SWATCH: Record<CheckoutAccent, string> = { yellow: "#FFD600", green: "#34D399", blue: "#60A5FA", coral: "#FF8A65", neutral: "#F5F5F2" };

export const COUNTDOWN_OPTIONS = [0, 5, 10, 15, 30] as const;

export interface CheckoutTestimonial {
  name: string;
  text: string;
}

export interface CheckoutConfig {
  accent: CheckoutAccent;
  logo_url: string | null;
  banner_url: string | null;
  show_guarantee: boolean;
  /** Minutos do contador de tempo; 0 = sem contador. */
  countdown_minutes: number;
  /** Texto do botão principal; vazio = "Gerar Pix" / "Pagar agora". */
  button_text: string;
  testimonials: CheckoutTestimonial[];
}

export const DEFAULT_CHECKOUT_CONFIG: CheckoutConfig = {
  accent: "yellow",
  logo_url: null,
  banner_url: null,
  show_guarantee: true,
  countdown_minutes: 0,
  button_text: "",
  testimonials: [],
};

/** Junta o que está salvo com os padrões, ignorando qualquer valor fora do esperado. */
export function resolveCheckoutConfig(saved: unknown): CheckoutConfig {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<CheckoutConfig>;
  const url = (v: unknown) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null);
  return {
    accent: CHECKOUT_ACCENTS.includes(s.accent as CheckoutAccent) ? (s.accent as CheckoutAccent) : "yellow",
    logo_url: url(s.logo_url),
    banner_url: url(s.banner_url),
    show_guarantee: s.show_guarantee !== false,
    countdown_minutes: COUNTDOWN_OPTIONS.includes(s.countdown_minutes as never) ? (s.countdown_minutes as number) : 0,
    button_text: typeof s.button_text === "string" ? s.button_text.slice(0, 40) : "",
    testimonials: Array.isArray(s.testimonials)
      ? s.testimonials
          .filter((t) => t && typeof t.name === "string" && typeof t.text === "string" && t.name.trim() && t.text.trim())
          .slice(0, 3)
          .map((t) => ({ name: t.name.slice(0, 60), text: t.text.slice(0, 280) }))
      : [],
  };
}
