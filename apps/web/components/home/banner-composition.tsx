import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/** Banner animado da página inicial (Remotion). 12 segundos, em ciclo: venda → dinheiro entrando → quanto sobra → convite. */
export const BANNER_FPS = 30;
export const BANNER_FRAMES = 360;

export interface BannerPalette {
  bg: string;
  card: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  track: string;
}

export const BANNER_PALETTES: Record<"dark" | "light", BannerPalette> = {
  dark: { bg: "#0b0b0c", card: "#18181a", line: "#2a2a2e", text: "#f5f5f2", muted: "#9b9ba1", accent: "#ffd600", track: "#26262a" },
  light: { bg: "#fffdf3", card: "#ffffff", line: "#e3dfd2", text: "#0b0b0c", muted: "#5f5e66", accent: "#7a5c00", track: "#ece8da" },
};

const BRAND = "#ffd600";
const INK = "#0b0b0c";
const OK = { dark: "#4ade9b", light: "#0b7f52" };
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const mono: CSSProperties = { fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace', fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" };

/** Entra e sai suavemente dentro da própria sequência. */
function Scene({ duration, children }: { duration: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

function Rise({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 120 } });
  return <div style={{ opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 40}px) scale(${0.94 + s * 0.06})`, ...style }}>{children}</div>;
}

function Wave({ color, progress, width, height, stroke = 10 }: { color: string; progress: number; width: number; height: number; stroke?: number }) {
  const length = 2700;
  return (
    <svg viewBox="0 0 1200 220" width={width} height={height} preserveAspectRatio="none" fill="none">
      <path d="M-20 150C120 20 240 20 300 110S480 210 600 110 780 10 900 110 1080 200 1220 70" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
    </svg>
  );
}

export function Banner({ theme }: { theme: "dark" | "light" }) {
  const p = BANNER_PALETTES[theme];
  const { width, height } = useVideoConfig();
  const compact = width < 1000;
  const u = compact ? width / 720 : width / 1280; // unidade de escala
  const frame = useCurrentFrame();
  const pad = (compact ? 40 : 72) * u;
  const card: CSSProperties = { background: p.card, border: `1.5px solid ${p.line}`, borderRadius: 18 * u };

  return (
    <AbsoluteFill style={{ background: p.bg, color: p.text, fontFamily: '"Manrope Variable", system-ui, sans-serif', overflow: "hidden" }}>
      {/* brilho de fundo, sempre em movimento */}
      <div
        style={{
          position: "absolute",
          width: width * 0.7,
          height: width * 0.7,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND}${theme === "dark" ? "30" : "55"} 0%, transparent 62%)`,
          left: interpolate(Math.sin(frame / 60), [-1, 1], [width * 0.35, width * 0.55]),
          top: interpolate(Math.cos(frame / 75), [-1, 1], [-width * 0.35, -width * 0.15]),
        }}
      />

      {/* 1 — Venda. Receba. Saque. */}
      <Sequence durationInFrames={95}>
        <Scene duration={95}>
          <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: `${4 * u}px ${26 * u}px`, fontSize: (compact ? 92 : 124) * u, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
              {["Venda.", "Receba.", "Saque."].map((word, i) => (
                <Rise key={word} at={4 + i * 14}>
                  <span style={{ color: i === 2 ? p.accent : p.text }}>{word}</span>
                </Rise>
              ))}
            </div>
            <Rise at={50} style={{ marginTop: 22 * u, fontSize: (compact ? 30 : 34) * u, color: p.muted, fontWeight: 600 }}>
              Seu produto digital à venda em minutos.
            </Rise>
          </AbsoluteFill>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: (compact ? -10 : -34) * u, opacity: 0.9 }}>
            <Wave color={BRAND} width={width} height={(compact ? 100 : 110) * u} progress={interpolate(frame, [10, 70], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })} />
          </div>
        </Scene>
      </Sequence>

      {/* 2 — O dinheiro entrando */}
      <Sequence from={95} durationInFrames={105}>
        <Scene duration={105}>
          <SalesScene p={p} theme={theme} compact={compact} u={u} pad={pad} card={card} />
        </Scene>
      </Sequence>

      {/* 3 — Quanto sobra */}
      <Sequence from={200} durationInFrames={100}>
        <Scene duration={100}>
          <BarsScene p={p} compact={compact} u={u} pad={pad} />
        </Scene>
      </Sequence>

      {/* 4 — Convite */}
      <Sequence from={300} durationInFrames={60}>
        <Scene duration={60}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: pad }}>
            <Rise at={2}>
              <Wave color={BRAND} width={260 * u} height={70 * u} stroke={22} progress={1} />
            </Rise>
            <Rise at={8} style={{ fontSize: (compact ? 60 : 76) * u, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 10 * u }}>
              Fique com mais do que é seu.
            </Rise>
            <Rise at={20} style={{ marginTop: 24 * u }}>
              <span style={{ display: "inline-block", background: BRAND, color: INK, fontWeight: 800, fontSize: (compact ? 28 : 30) * u, padding: `${16 * u}px ${34 * u}px`, borderRadius: 16 * u }}>Crie sua conta grátis</span>
            </Rise>
          </AbsoluteFill>
        </Scene>
      </Sequence>
    </AbsoluteFill>
  );
}

function SalesScene({ p, theme, compact, u, pad, card }: { p: BannerPalette; theme: "dark" | "light"; compact: boolean; u: number; pad: number; card: CSSProperties }) {
  const frame = useCurrentFrame();
  const sales = [
    { who: "Marina S.", how: "Pix", cents: 19700 },
    { who: "Carlos A.", how: "Cartão 3x", cents: 22400 },
    { who: "Juliana P.", how: "Pix", cents: 19700 },
  ];
  const base = 131200;
  const total = sales.reduce((acc, s, i) => acc + s.cents * interpolate(frame, [14 + i * 20, 30 + i * 20], [0, 1], clamp), base);
  return (
    <AbsoluteFill style={{ flexDirection: compact ? "column" : "row", alignItems: compact ? "stretch" : "center", justifyContent: "center", gap: (compact ? 26 : 70) * u, padding: pad }}>
      <div style={{ flex: compact ? "none" : 1 }}>
        <Rise at={2} style={{ fontSize: (compact ? 30 : 32) * u, color: p.muted, fontWeight: 600 }}>
          Você vendeu hoje
        </Rise>
        <Rise at={6} style={{ ...mono, fontSize: (compact ? 88 : 104) * u, fontWeight: 700, color: p.accent, lineHeight: 1.1 }}>
          {brl(Math.round(total))}
        </Rise>
        <Rise at={12} style={{ fontSize: (compact ? 26 : 28) * u, color: p.muted, marginTop: 6 * u }}>
          Cada venda aprovada aparece na hora.
        </Rise>
      </div>
      <div style={{ width: compact ? "100%" : 480 * u, display: "flex", flexDirection: "column", gap: 12 * u }}>
        {sales.map((s, i) => (
          <Rise key={s.who} at={12 + i * 20}>
            <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${16 * u}px ${22 * u}px` }}>
              <div>
                <div style={{ fontSize: 26 * u, fontWeight: 800 }}>{s.who}</div>
                <div style={{ fontSize: 20 * u, color: p.muted }}>{s.how} · agora</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...mono, fontSize: 26 * u, fontWeight: 700 }}>{brl(s.cents)}</div>
                <div style={{ fontSize: 20 * u, fontWeight: 800, color: OK[theme] }}>✓ Aprovada</div>
              </div>
            </div>
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function BarsScene({ p, compact, u, pad }: { p: BannerPalette; compact: boolean; u: number; pad: number }) {
  const frame = useCurrentFrame();
  // Mesmos números do comparativo da página (taxas padrão de cartão, venda de R$ 197,00).
  const rows = [
    { name: "Domma Mart", cents: 18765, us: true },
    { name: "Concorrente C", cents: 18468 },
    { name: "Concorrente V", cents: 18024 },
    { name: "Concorrente K", cents: 17680 },
    { name: "Concorrente H", cents: 17501 },
  ];
  const size = (compact ? 26 : 28) * u;
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
      <Rise at={2} style={{ fontSize: (compact ? 40 : 46) * u, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20 * u }}>
        De cada <span style={{ ...mono, color: p.accent }}>R$ 197,00</span> no cartão, fica com você:
      </Rise>
      <div style={{ display: "flex", flexDirection: "column", gap: (compact ? 12 : 13) * u }}>
        {rows.map((row, i) => {
          const grow = interpolate(frame, [12 + i * 6, 46 + i * 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          const share = (row.cents - 16000) / (19700 - 16000);
          return (
            <div key={row.name} style={{ display: "grid", gridTemplateColumns: `${(compact ? 215 : 250) * u}px 1fr ${(compact ? 150 : 170) * u}px`, alignItems: "center", gap: 16 * u }}>
              <span style={{ fontSize: size, fontWeight: 800, color: row.us ? p.accent : p.muted }}>{row.name}</span>
              <span style={{ height: 16 * u, borderRadius: 99, background: p.track, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${share * grow * 100}%`, borderRadius: 99, background: row.us ? BRAND : "#8a8a92" }} />
              </span>
              <span style={{ ...mono, fontSize: size, fontWeight: 700, textAlign: "right", color: row.us ? p.accent : p.text }}>{brl(Math.round(16000 + (row.cents - 16000) * grow))}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
