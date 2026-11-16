import type { MetadataRoute } from "next";

/** Aplicativo instalável (PWA): abre em tela cheia, com ícone próprio e atalhos para o que o produtor mais usa. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Domma Mart",
    short_name: "Domma Mart",
    description: "Venda produtos digitais e acompanhe suas vendas, seu saldo e seus saques.",
    lang: "pt-BR",
    start_url: "/?origem=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0C",
    theme_color: "#0B0B0C",
    categories: ["business", "finance", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vendas", url: "/painel/vendas", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Financeiro", url: "/painel/financeiro", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Novo produto", url: "/painel/produtos/novo", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Minhas compras", url: "/compras", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
