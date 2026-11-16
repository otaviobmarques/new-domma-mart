"use client";

import { Player } from "@remotion/player";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-toggle";
import { BANNER_FPS, BANNER_FRAMES, BANNER_PALETTES, Banner } from "./banner-composition";

/**
 * Banner animado no topo da página inicial, feito com Remotion e tocado direto no navegador.
 * Acompanha o modo claro/noturno, troca de formato no celular e, com movimento reduzido, fica parado no convite.
 */
export function HomeBanner() {
  const theme = useTheme();
  const [mode, setMode] = useState<{ compact: boolean; still: boolean } | null>(null);
  useEffect(() => {
    const narrow = matchMedia("(max-width: 767px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMode({ compact: narrow.matches, still: reduced.matches });
    update();
    narrow.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      narrow.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  const size = mode?.compact ? { width: 720, height: 560 } : { width: 1280, height: 440 };
  return (
    <div
      role="img"
      aria-label="Animação: venda, receba e saque. As vendas aprovadas aparecem na hora e, de cada R$ 197,00 no cartão, R$ 187,65 ficam com você."
      className="overflow-hidden rounded-3xl border border-line aspect-[720/560] md:aspect-[1280/440]"
      style={{ background: BANNER_PALETTES[theme].bg }}
    >
      {mode && (
        <Player
          key={`${mode.compact}-${mode.still}`}
          component={Banner}
          inputProps={{ theme }}
          durationInFrames={BANNER_FRAMES}
          fps={BANNER_FPS}
          compositionWidth={size.width}
          compositionHeight={size.height}
          style={{ width: "100%", height: "100%" }}
          autoPlay={!mode.still}
          initialFrame={mode.still ? 330 : 0}
          loop
          initiallyMuted
          numberOfSharedAudioTags={0}
          controls={false}
          clickToPlay={false}
          acknowledgeRemotionLicense
        />
      )}
    </div>
  );
}
