import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { redirect } from "next/navigation";
import { FeeSimulator } from "@/components/fee-simulator";
import { ButtonLink, Logo } from "@/components/ui";
import { getMe } from "@/lib/session";

export default async function Home() {
  const me = await getMe();
  if (me) redirect(me.accounts.length ? "/painel" : "/compras");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Logo />
        <ButtonLink href="/entrar" variant="outline" size="sm">
          Entrar
        </ButtonLink>
      </header>
      <main className="mx-auto max-w-5xl px-5 pt-8 pb-16 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12 lg:pt-16">
        <div>
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
            Coloque seu produto digital à venda <span className="text-brand">em minutos</span>.
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted">Curso, e-book, mentoria ou comunidade. Você descreve, a gente monta o checkout, recebe o pagamento e entrega o acesso.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/cadastro" size="lg">
              Criar conta grátis
            </ButtonLink>
            <ButtonLink href="/verificar-link" size="lg" variant="outline">
              Este link é verdadeiro?
            </ButtonLink>
          </div>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              [Zap, "Checkout em uma tela só, com Pix aprovado em segundos."],
              [Sparkles, "A Domma IA preenche o produto para você revisar e publicar."],
              [ShieldCheck, "Reembolso automático na garantia e regras de saldo sempre visíveis."],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Zap;
              return (
                <li key={text as string} className="flex items-start gap-2.5 text-paper/90">
                  <I size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="mt-10 lg:mt-0">
          <h2 className="mb-3 text-lg font-bold">Quanto você recebe por venda</h2>
          <FeeSimulator />
        </div>
      </main>
    </div>
  );
}
