import { BadgeCheck, Banknote, Clock3, Code2, MessageCircleHeart, RotateCcw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FeeSimulator } from "@/components/fee-simulator";
import { HeroScene } from "@/components/home/hero-scene";
import { AiCreatorArt, WaveArt } from "@/components/home/illustrations";
import { Reveal } from "@/components/home/motion";
import { Photos } from "@/components/home/photos";
import { HomeBanner } from "@/components/home/banner";
import { Comparison } from "@/components/home/comparison";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink, Logo } from "@/components/ui";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";
import { getMe } from "@/lib/session";

// O que o Domma Mart faz diferente, a partir das queixas mais comuns do mercado (anexo B do descritivo).
const BETTER = [
  { icon: Banknote, title: "Taxa menor e saque grátis", text: "3,99% + R$ 1,49 no cartão e R$ 1,49 fixo no Pix. Sacar para a sua chave Pix não custa nada." },
  { icon: Sparkles, title: "A IA faz o trabalho chato", text: "Você descreve o que quer vender e recebe nome, descrição, preço e estrutura do curso prontos para revisar. Nada vai ao ar sem a sua aprovação." },
  { icon: Zap, title: "Checkout em uma tela só", text: "Sem criar conta nem senha. O comprador paga por Pix, a tela confirma sozinha e o acesso chega na hora." },
  { icon: RotateCcw, title: "Reembolso que o comprador acompanha", text: "Dentro da garantia é automático. A linha do tempo mostra cada etapa, o próximo passo e de quem ele depende." },
  { icon: Clock3, title: "Seu dinheiro com regra clara", text: "A tela Financeiro mostra o que está disponível, o que libera em cada data e o que está reservado. Bloqueio só com motivo por escrito e prazo de análise." },
  { icon: ShieldCheck, title: "Proteção contra golpe", text: "Página pública para conferir se um link de pagamento é verdadeiro e selo em todo checkout. Saque só para a mesma titularidade, com código de confirmação." },
  { icon: Code2, title: "Plataforma aberta", text: "Tudo o que o painel faz está na API. Webhooks assinados, com reenvio automático por até 72 horas e histórico de entregas." },
  { icon: MessageCircleHeart, title: "Sem anúncio na área do aluno", text: "Na área de membros só aparecem os seus conteúdos e as suas ofertas. Nada de terceiros." },
];

const STEPS = [
  ["Descreva", "Conte em uma frase o que você quer vender."],
  ["Revise", "A Domma IA preenche tudo. Você ajusta o que quiser."],
  ["Venda", "Copie o link do checkout e divulgue."],
];

export default async function Home() {
  const me = await getMe();
  if (me) redirect(me.accounts.length ? "/painel" : "/compras");
  // Dados estruturados para buscadores: quem é a empresa e o que o serviço oferece.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "Domma Mart", url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
      { "@type": "WebSite", "@id": `${SITE_URL}/#site`, url: SITE_URL, name: "Domma Mart", inLanguage: "pt-BR", publisher: { "@id": `${SITE_URL}/#org` } },
      {
        "@type": "SoftwareApplication",
        name: "Domma Mart",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "BRL", description: "Conta grátis. Taxa por venda: 3,99% + R$ 1,49 no cartão e R$ 1,49 no Pix." },
      },
    ],
  };
  return (
    <div className="min-h-dvh overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Principal">
            <a href="#comparativo" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-paper/80 hover:text-paper sm:block">
              Comparativo
            </a>
            <a href="#simulador" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-paper/80 hover:text-paper sm:block">
              Taxas
            </a>
            <ThemeToggle />
            <ButtonLink href="/entrar" variant="ghost" size="sm">
              Entrar
            </ButtonLink>
            <ButtonLink href="/cadastro" size="sm">
              Criar conta
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* Banner animado (Remotion) */}
        <div className="mx-auto max-w-6xl px-5 pt-5">
          <HomeBanner />
        </div>

        {/* Abertura */}
        <section className="relative">
          <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl gap-16 px-5 pt-12 pb-20 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-20 lg:pb-24">
          <div className="pop-in">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-dim px-3 py-1 text-xs font-bold text-accent">
              <BadgeCheck size={14} aria-hidden /> Plataforma de infoprodutos da família Domma
            </p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.02] font-extrabold tracking-tight sm:text-6xl">
              Venda seu produto digital e fique com <span className="sheen">mais do que é seu</span>.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">Curso, e-book, mentoria ou comunidade. Você descreve, a gente monta o checkout, recebe o pagamento, entrega o acesso e repassa o saldo.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/cadastro" size="lg">
                Criar conta grátis
              </ButtonLink>
              <ButtonLink href="#comparativo" size="lg" variant="outline">
                Ver o comparativo
              </ButtonLink>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                ["3,99%", "+ R$ 1,49 no cartão"],
                ["R$ 1,49", "fixo por venda no Pix"],
                ["R$ 0", "para sacar"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="num text-2xl font-bold text-accent sm:text-3xl">{value}</dt>
                  <dd className="mt-1 text-xs text-muted sm:text-sm">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroScene />
          </div>
        </section>

        {/* O que dá para vender */}
        <div className="overflow-hidden border-y border-line bg-graphite/40 py-4" aria-label="Venda cursos, e-books, mentorias, comunidades, eventos e assinaturas">
          <div className="marquee flex w-max gap-10 text-sm font-bold whitespace-nowrap text-paper/60" aria-hidden>
            {[0, 1].flatMap((n) => ["Cursos em vídeo", "E-books", "Mentorias", "Comunidades", "Eventos e ingressos", "Planilhas e modelos", "Assinaturas", "Aulas ao vivo"].map((t) => (
              <span key={`${n}-${t}`} className="flex items-center gap-10">
                {t} <span className="size-1.5 rounded-full bg-brand" />
              </span>
            )))}
          </div>
        </div>

        {/* Para quem é */}
        <section className="mx-auto max-w-6xl px-5 pt-16 lg:pt-20">
          <Reveal>
            <h2 className="max-w-2xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Feito para quem transforma o que sabe em renda.</h2>
            <p className="mt-3 mb-8 max-w-2xl text-muted">Do primeiro vídeo gravado em casa ao aluno assistindo no sofá, a plataforma cuida do caminho inteiro.</p>
          </Reveal>
          <Photos />
        </section>

        {/* Comparativo */}
        <section id="comparativo" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
            <Reveal>
              <h2 className="max-w-2xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Faça a conta antes de escolher onde vender.</h2>
              <p className="mt-3 mb-8 max-w-2xl text-muted">A mesma venda, a mesma forma de pagamento. Muda só quanto sobra para você.</p>
            </Reveal>
            <Comparison />
          </div>
        </section>

        {/* O que temos de melhor */}
        <section className="relative border-t border-line">
          <WaveArt className="reveal is-visible pointer-events-none absolute inset-x-0 top-0 h-40 w-full opacity-40" />
          <div className="relative mx-auto max-w-6xl px-5 py-16 lg:py-20">
          <Reveal>
            <h2 className="max-w-2xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">O que a gente faz melhor.</h2>
            <p className="mt-3 max-w-2xl text-muted">Lemos as reclamações mais comuns sobre as plataformas do mercado e construímos o Domma Mart para já nascer sem elas.</p>
          </Reveal>
          <ul className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BETTER.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={(i % 4) * 90} className="lift rounded-2xl border border-line bg-graphite p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-dim text-accent">
                  <Icon size={20} aria-hidden />
                </span>
                <h3 className="mt-4 leading-snug font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </Reveal>
            ))}
          </ul>
          </div>
        </section>

        {/* IA em destaque */}
        <section className="border-t border-line bg-graphite/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-2 lg:items-center lg:py-20">
            <Reveal>
              <p className="text-sm font-bold tracking-wide text-accent uppercase">Domma IA</p>
              <h2 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Você descreve em uma frase. O produto aparece pronto.</h2>
              <p className="mt-4 max-w-md text-muted">Nome, descrição, preço sugerido, garantia e a estrutura de módulos e aulas. Cada item tem “Editar” e “Gerar de novo”, e nada é publicado sem você aprovar.</p>
              <ButtonLink href="/cadastro" size="lg" className="mt-6">
                Criar meu primeiro produto
              </ButtonLink>
            </Reveal>
            <Reveal delay={120} className="mx-auto w-full max-w-md">
              <AiCreatorArt />
            </Reveal>
          </div>
        </section>

        {/* Como funciona + simulador */}
        <section id="simulador" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-2 lg:items-center lg:py-20">
            <Reveal>
              <h2 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Do cadastro à primeira venda em minutos.</h2>
              <ol className="mt-8 space-y-5">
                {STEPS.map(([title, text], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="num grid size-10 shrink-0 place-items-center rounded-full border border-brand/40 text-sm font-bold text-accent">{i + 1}</span>
                    <div>
                      <h3 className="font-bold">{title}</h3>
                      <p className="text-muted">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal delay={120}>
              <h3 className="mb-3 text-lg font-bold">Quanto você recebe por venda</h3>
              <FeeSimulator />
            </Reveal>
          </div>
        </section>

        {/* Chamada final */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <Reveal className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-onbrand sm:px-12">
            <svg viewBox="0 0 1200 220" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full opacity-25" preserveAspectRatio="none" aria-hidden>
              <path d="M-20 150C120 20 240 20 300 110S480 210 600 110 780 10 900 110 1080 200 1220 70" stroke="#0B0B0C" strokeWidth="10" strokeLinecap="round" fill="none" />
            </svg>
            <div className="relative">
            <h2 className="mx-auto max-w-xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Seu primeiro produto pode estar à venda ainda hoje.</h2>
            <p className="mx-auto mt-3 max-w-md font-medium text-onbrand/75">Conta grátis, sem senha e sem mensalidade. Você só paga quando vende.</p>
            <Link href="/cadastro" className="mt-7 inline-flex h-13 items-center justify-center rounded-xl bg-onbrand px-7 text-base font-bold text-[#f5f5f2] transition hover:opacity-90">
              Criar conta grátis
            </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Logo size={22} />
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Rodapé">
            <Link href="/verificar-link" className="hover:text-paper">
              Este link é verdadeiro?
            </Link>
            <Link href="/compras" className="hover:text-paper">
              Minhas compras
            </Link>
            <Link href="/termos" className="hover:text-paper">
              Termos de compra
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
