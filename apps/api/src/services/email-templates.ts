import { formatBRL } from "@domma/core";

export type EmailTemplate = "login_code" | "access_granted" | "refund_update" | "withdrawal_update" | "pix_key_changed" | "product_review" | "notice" | "test";

/** Conteúdo de um e-mail, sem formatação: o mesmo conteúdo vira a versão HTML e a versão em texto. */
interface Content {
  subject: string;
  /** Linha que aparece ao lado do assunto na caixa de entrada. */
  preview: string;
  heading: string;
  paragraphs: string[];
  code?: string;
  highlight?: { label: string; value: string };
  button?: { label: string; href: string };
  footnote?: string;
}

const str = (v: unknown) => String(v ?? "");

function content(template: string, d: Record<string, unknown>, webUrl: string): Content {
  switch (template) {
    case "login_code":
      return {
        subject: `${str(d.code)} é o seu código do Domma Mart`,
        preview: "Vale por 10 minutos e só pode ser usado uma vez.",
        heading: "Seu código de acesso",
        paragraphs: ["Digite este código para entrar. Você não precisa de senha."],
        code: str(d.code),
        footnote: "O código vale por 10 minutos e só pode ser usado uma vez. Se não foi você que pediu, ignore esta mensagem: ninguém entra na sua conta sem o código. O Domma Mart nunca pede este código por telefone ou WhatsApp.",
      };
    case "access_granted":
      return {
        subject: `Seu acesso a ${str(d.product)} está liberado`,
        preview: "Pagamento aprovado. É só tocar no botão para acessar.",
        heading: `Tudo certo, ${str(d.name)}!`,
        paragraphs: [`O pagamento foi aprovado e o seu acesso a ${str(d.product)} já está liberado.`, "Não precisa criar senha: o botão abaixo já abre o seu produto."],
        button: { label: "Acessar meu produto", href: str(d.link) },
        footnote: "O botão vale por 7 dias. Depois disso, entre em Minhas compras com o e-mail, celular ou CPF usado na compra. Guarde este e-mail: ele é o seu comprovante.",
      };
    case "refund_update":
      return {
        subject: `Seu reembolso: ${str(d.title)}`,
        preview: str(d.message),
        heading: "Atualização do seu reembolso",
        paragraphs: [str(d.message)],
        button: d.link ? { label: "Acompanhar reembolso", href: str(d.link) } : undefined,
      };
    case "withdrawal_update":
      return {
        subject: str(d.title),
        preview: str(d.message),
        heading: str(d.title),
        paragraphs: [str(d.message)],
        highlight: { label: "Valor do saque", value: formatBRL(Number(d.amount_cents ?? 0)) },
        button: { label: "Abrir o Financeiro", href: `${webUrl}/painel/financeiro` },
      };
    case "pix_key_changed":
      return {
        subject: "Sua chave Pix de saque foi trocada",
        preview: `Por segurança, os saques ficam pausados por ${str(d.hours)} horas.`,
        heading: "A chave Pix de saque foi trocada",
        paragraphs: [`A chave Pix usada para os seus saques acabou de ser trocada. Por segurança, os saques ficam pausados por ${str(d.hours)} horas.`, "Se foi você, não precisa fazer nada."],
        button: { label: "Não fui eu", href: `${webUrl}/ajuda` },
        footnote: "Se não foi você, toque no botão e fale com a gente agora: alguém pode ter entrado na sua conta.",
      };
    case "test":
      return {
        subject: "Teste de envio do Domma Mart",
        preview: "Se você está lendo isto, os e-mails estão saindo.",
        heading: "Os e-mails estão saindo",
        paragraphs: ["Este é um envio de teste feito pelo backoffice. Se chegou na caixa de entrada (e não no spam), o endereço de envio está configurado corretamente."],
      };
    // "product_review" é o nome antigo dos avisos gerais; continua aceito para o que já está na fila.
    case "product_review":
    case "notice":
      return {
        subject: str(d.title),
        preview: str(d.message),
        heading: str(d.title),
        paragraphs: str(d.message).split(/\n{2,}/),
        button: d.link ? { label: str(d.link_label ?? "Abrir no Domma Mart"), href: str(d.link) } : undefined,
      };
    default:
      return { subject: "Domma Mart", preview: "", heading: "Domma Mart", paragraphs: [str(d.message ?? "")] };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Monta o e-mail em HTML (tabelas e estilos na própria tag, para funcionar em qualquer programa) e em texto puro. */
export function renderEmail(template: string, data: Record<string, unknown>, webUrl: string): { subject: string; html: string; text: string } {
  const c = content(template, data, webUrl);
  const p = (text: string, style = "") => `<p style="margin:0 0 16px;${style}">${esc(text).replace(/\n/g, "<br>")}</p>`;
  const body = [
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:#0B0B0C">${esc(c.heading)}</h1>`,
    ...c.paragraphs.filter(Boolean).map((t) => p(t)),
    c.code
      ? `<p style="margin:8px 0 24px;padding:16px;background:#F6F5F0;border-radius:12px;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#0B0B0C">${esc(c.code)}</p>`
      : "",
    c.highlight
      ? `<p style="margin:8px 0 24px;padding:14px 16px;background:#F6F5F0;border-radius:12px;font-size:14px;color:#55534C">${esc(c.highlight.label)}<br><span style="font-size:24px;font-weight:800;color:#0B0B0C">${esc(c.highlight.value)}</span></p>`
      : "",
    c.button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:#FFD600"><a href="${esc(c.button.href)}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:16px;font-weight:800;color:#0B0B0C;text-decoration:none">${esc(c.button.label)}</a></td></tr></table>` +
        p(`Se o botão não abrir, copie este endereço no navegador: ${c.button.href}`, "font-size:12px;color:#8A877E;word-break:break-all")
      : "",
    c.footnote ? p(c.footnote, "font-size:13px;color:#6B6860") : "",
  ].join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#F1EFE8">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFE8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="background:#0B0B0C;border-radius:16px 16px 0 0;padding:18px 28px;font-family:${FONT}"><span style="font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px">Domma</span> <span style="font-size:11px;font-weight:800;color:#FFD600;letter-spacing:3px">MART</span></td></tr>
<tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:28px;font-family:${FONT};font-size:16px;line-height:1.55;color:#2A2925">${body}</td></tr>
<tr><td style="padding:18px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:#8A877E">Você recebeu este e-mail porque usou este endereço no Domma Mart. Esta é uma mensagem automática sobre a sua conta ou a sua compra.<br><a href="${esc(webUrl)}/ajuda" style="color:#8A877E">Precisa de ajuda?</a> · <a href="${esc(webUrl)}/verificar-link" style="color:#8A877E">Conferir se um link é verdadeiro</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs.filter(Boolean),
    c.code ? `\nCódigo: ${c.code}\n` : "",
    c.highlight ? `${c.highlight.label}: ${c.highlight.value}` : "",
    c.button ? `\n${c.button.label}: ${c.button.href}\n` : "",
    c.footnote ?? "",
    "",
    "Domma Mart",
    `Ajuda: ${webUrl}/ajuda`,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { subject: c.subject.replace(/\s+/g, " ").slice(0, 150), html, text };
}
