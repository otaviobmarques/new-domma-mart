import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Áreas logadas e checkouts não entram na busca; o que é público, sim.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/painel", "/backoffice", "/compras", "/assistir", "/reembolso", "/ajuda", "/acesso", "/c/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
