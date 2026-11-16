import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/shell";

export const metadata: Metadata = { title: "Entrar", description: "Entre sem senha: enviamos um código para o e-mail, celular ou CPF que você usou.", alternates: { canonical: "/entrar" } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Acesse sua conta"
      subtitle="Você não precisa de senha. Achamos sua compra ou sua conta pelo e-mail, celular ou CPF e enviamos um código."
      footer={
        <>
          Quer vender no Domma Mart?{" "}
          <Link href="/cadastro" className="font-bold text-accent underline underline-offset-4">
            Crie sua conta
          </Link>
          <br />
          <span className="mt-2 inline-block">O link que você recebeu por e-mail também abre suas compras direto.</span>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
