const TZ = "America/Sao_Paulo";

export const formatDate = (iso: string | Date) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ });
export const formatDay = (iso: string | Date) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
export const formatTime = (iso: string | Date) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const formatDateTime = (iso: string | Date) => `${formatDay(iso)} às ${formatTime(iso)}`;

export function timeAgo(iso: string | Date): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return formatDate(iso);
}

export const METHOD_LABEL: Record<string, string> = { pix: "Pix", card: "Cartão", boleto: "Boleto" };
export const paymentLabel = (method: string, installments = 1) => (method === "card" && installments > 1 ? `Cartão ${installments}x` : (METHOD_LABEL[method] ?? method));

export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  course: "Curso",
  file: "Arquivo",
  subscription: "Assinatura",
  community: "Comunidade",
  event: "Evento",
  service: "Mentoria",
};
