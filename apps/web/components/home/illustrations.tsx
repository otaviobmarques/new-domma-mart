import { Sparkles } from "lucide-react";

/** A onda da marca, usada como ilustração de fundo. Desenha-se sozinha quando entra na tela. */
export function WaveArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 220" fill="none" className={className} aria-hidden preserveAspectRatio="none">
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          className="draw"
          style={{ ["--len" as never]: 2600, animationDelay: `${i * 0.25}s` }}
          d={`M-20 ${150 + i * 18}C120 ${20 + i * 18} 240 ${20 + i * 18} 300 ${110 + i * 18}S480 ${210 + i * 18} 600 ${110 + i * 18} 780 ${10 + i * 18} 900 ${110 + i * 18} 1080 ${200 + i * 18} 1220 ${70 + i * 18}`}
          stroke="#FFD600"
          strokeOpacity={0.5 - i * 0.15}
          strokeWidth={3 - i * 0.6}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Ilustração do "criar produto com IA": a descrição vira um produto pronto para revisar. */
export function AiCreatorArt() {
  const row = "rounded-lg border border-line bg-ink px-3 py-2";
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-8 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative rounded-2xl border border-line bg-graphite p-4 shadow-2xl">
        <p className="text-[11px] text-muted">Você descreveu</p>
        <p className="mt-1 text-sm">Um curso em vídeo de confeitaria para iniciantes, com 12 aulas e receitas em PDF.</p>
      </div>
      <div className="relative mx-auto h-8 w-px bg-gradient-to-b from-line to-brand" />
      <div className="relative rounded-2xl border border-brand/30 bg-brand-dim p-3">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 px-2.5 py-0.5 text-[11px] font-bold text-brand">
          <Sparkles size={12} /> Preenchido pela Domma IA
        </p>
        <div className="space-y-2 text-sm">
          <div className={row}>
            <p className="text-[10px] text-muted">Nome</p>
            <p className="font-bold">Confeitaria do zero: seus primeiros doces</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className={row}>
              <p className="text-[10px] text-muted">Preço sugerido</p>
              <p className="num font-bold">R$ 147,00</p>
            </div>
            <div className={row}>
              <p className="text-[10px] text-muted">Garantia</p>
              <p className="font-bold">7 dias</p>
            </div>
          </div>
          <div className={row}>
            <p className="text-[10px] text-muted">Conteúdo · 4 módulos, 12 aulas</p>
            <ol className="mt-1 space-y-0.5 text-xs text-paper/85">
              <li>1. Utensílios e ingredientes</li>
              <li>2. Massas básicas</li>
              <li>3. Recheios e coberturas</li>
              <li>4. Montagem e acabamento</li>
            </ol>
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-brand py-2.5 text-center text-sm font-bold text-ink">Publicar produto</div>
      </div>
    </div>
  );
}
