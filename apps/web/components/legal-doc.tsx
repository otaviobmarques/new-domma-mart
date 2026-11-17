import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";
import { COMPANY_COMPLETE, LEGAL_DATE, LEGAL_REVIEWED, LEGAL_VERSION } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  /** O ponto principal em uma ou duas frases, para quem não vai ler tudo. */
  summary: string;
  body: ReactNode;
}

const DOCS = [
  { href: "/termos", label: "Termos de Uso" },
  { href: "/termos/produtores", label: "Contrato do Produtor" },
  { href: "/privacidade", label: "Política de Privacidade" },
];

/** Página de documento legal: resumo em linguagem simples no topo de cada parte e o texto completo abaixo. */
export function LegalDoc({ title, intro, current, sections }: { title: string; intro: ReactNode; current: string; sections: LegalSection[] }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" aria-label="Domma Mart">
        <Logo />
      </Link>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm font-semibold" aria-label="Documentos">
        {DOCS.map((d) => (
          <Link key={d.href} href={d.href} aria-current={d.href === current ? "page" : undefined} className={`rounded-full border px-3 py-1.5 ${d.href === current ? "border-brand bg-brand-dim text-accent" : "border-line text-muted hover:text-paper"}`}>
            {d.label}
          </Link>
        ))}
      </nav>
      <h1 className="mt-6 text-3xl font-extrabold">{title}</h1>
      <p className="mt-1.5 text-sm text-muted">
        Versão {LEGAL_VERSION} · em vigor desde {LEGAL_DATE}
      </p>
      {(!LEGAL_REVIEWED || !COMPANY_COMPLETE) && (
        <p className="mt-4 rounded-xl border border-wait/30 bg-wait-dim p-3 text-sm text-wait">
          Documento em revisão. {!COMPANY_COMPLETE ? "Ainda faltam os dados da empresa (razão social, CNPJ, endereço e e-mails de contato). " : ""}
          {!LEGAL_REVIEWED ? "O texto precisa da conferência de um advogado antes da abertura ao público." : ""}
        </p>
      )}
      <div className="mt-5 text-muted">{intro}</div>

      <nav className="mt-6 rounded-2xl border border-line bg-graphite p-4" aria-label="Nesta página">
        <p className="mb-2 text-sm font-bold">Nesta página</p>
        <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent underline-offset-4 hover:underline">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="mt-9 scroll-mt-6">
          <h2 className="text-xl font-extrabold">
            {i + 1}. {s.title}
          </h2>
          <p className="mt-2 rounded-xl bg-raised px-3.5 py-2.5 text-sm">
            <span className="font-bold">Em resumo: </span>
            {s.summary}
          </p>
          <div className="legal mt-3 space-y-3 leading-relaxed text-muted [&_a]:text-accent [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-paper [&_ul]:space-y-1.5">{s.body}</div>
        </section>
      ))}
      <p className="mt-10 border-t border-line pt-5 text-sm text-muted">
        Dúvidas sobre este documento?{" "}
        <Link href="/ajuda" className="text-accent underline">
          Fale com a gente pela página de Ajuda
        </Link>
        .
      </p>
    </main>
  );
}
