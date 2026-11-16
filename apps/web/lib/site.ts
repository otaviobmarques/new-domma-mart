/** Endereço oficial do site, usado em SEO, mapa do site e prévia de links. */
export const SITE_URL = (process.env.WEB_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");
export const SITE_NAME = "Domma Mart";
export const SITE_TITLE = "Domma Mart — venda seu produto digital e fique com mais do que é seu";
export const SITE_DESCRIPTION = "Plataforma para vender cursos, e-books, mentorias e comunidades. Checkout em uma tela, Pix aprovado em segundos, taxa de 3,99% + R$ 1,49 no cartão e saque grátis.";
