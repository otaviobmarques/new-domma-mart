import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pwa";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Domma Mart" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["plataforma de infoprodutos", "vender curso online", "checkout Pix", "vender e-book", "área de membros", "produtos digitais", "taxas para infoprodutor"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NAME, url: "/", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
    { media: "(prefers-color-scheme: light)", color: "#F6F5F0" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Define o tema antes de a página aparecer: a escolha salva ou, sem ela, a preferência do aparelho.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("dm-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* Sem JavaScript, o conteúdo que seria revelado ao rolar aparece direto. */}
        <noscript>
          <style>{".reveal{opacity:1!important;transform:none!important}.reveal .bar{transform:none!important}"}</style>
        </noscript>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
