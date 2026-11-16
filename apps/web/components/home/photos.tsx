import Image from "next/image";
import { Reveal } from "./motion";

const PHOTOS = [
  { src: "/home/produtora.jpg", pos: "42% 50%", alt: "Confeiteira sorrindo enquanto grava uma aula em vídeo na cozinha de casa", tag: "Quem ensina", title: "Grave do seu jeito", text: "Suba as aulas, organize em módulos e libere aos poucos, se quiser." },
  { src: "/home/venda.jpg", pos: "36% 50%", alt: "Produtor de cursos sorrindo ao olhar o celular em seu estúdio", tag: "Quem vende", title: "Veja a venda na hora", text: "Cada pagamento aprovado aparece no seu painel assim que acontece." },
  { src: "/home/aluna.jpg", pos: "34% 50%", alt: "Aluna no sofá assistindo a uma aula no tablet e fazendo anotações", tag: "Quem aprende", title: "Acesso em segundos", text: "Seu aluno paga, entra sem senha e continua de onde parou." },
];

/** Fotos geradas por IA para ilustrar quem usa a plataforma (não são clientes reais). */
export function Photos() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {PHOTOS.map((p, i) => (
        <Reveal as="li" key={p.src} delay={i * 120} className="group relative overflow-hidden rounded-3xl border border-line bg-graphite" theme="dark">
          <div className="relative aspect-[4/3] overflow-hidden md:aspect-[4/5]">
            <Image src={p.src} alt={p.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" style={{ objectPosition: p.pos }} />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="inline-block rounded-full bg-brand px-2.5 py-0.5 text-xs font-extrabold text-onbrand">{p.tag}</p>
            <h3 className="mt-2 text-xl font-extrabold">{p.title}</h3>
            <p className="mt-1 text-sm text-paper/80">{p.text}</p>
          </div>
        </Reveal>
      ))}
    </ul>
  );
}
