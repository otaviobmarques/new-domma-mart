import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/shell";
import { VerifyLink } from "@/components/buyer/verify-link";

// O endereço oficial vem da configuração do ambiente, lida a cada acesso.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Este link é verdadeiro?" };

/** C08 — Página pública para proteger o comprador de páginas falsas. */
export default function VerifyLinkPage() {
  const official = new URL(process.env.WEB_URL ?? "http://localhost:3000").host;
  return (
    <AuthShell
      title="Este link é verdadeiro?"
      subtitle="Cole o link de pagamento que você recebeu antes de pagar."
      footer={
        <>
          Nosso checkout só abre em <span className="num text-paper">{official}</span> ou no domínio verificado do produtor.
        </>
      }
    >
      <VerifyLink />
    </AuthShell>
  );
}
