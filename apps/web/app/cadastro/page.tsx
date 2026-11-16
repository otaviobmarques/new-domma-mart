import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Criar conta", description: "Crie sua conta no Domma Mart em 1 minuto, sem senha, e coloque seu primeiro produto digital à venda.", alternates: { canonical: "/cadastro" } };

export default function SignupPage() {
  return (
    <AuthShell
      title="Crie sua conta em 1 minuto"
      subtitle="Sem senha: enviamos um código para confirmar."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/entrar" className="font-bold text-accent underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
