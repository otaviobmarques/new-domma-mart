import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const font = (file: string) => readFile(join(process.cwd(), "assets", file));

/** Imagem de prévia de link (WhatsApp, Instagram, X…) no visual da marca. */
export async function ogImage(input: { eyebrow: string; title: string; highlight?: string; footer: { value: string; label: string }[] }) {
  const [bold, medium] = await Promise.all([font("manrope-800.woff"), font("manrope-500.woff")]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0B0B0C", color: "#F5F5F2", padding: 64, fontFamily: "Manrope", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, background: "radial-gradient(circle at 84% 18%, rgba(255,214,0,0.30) 0%, rgba(255,214,0,0) 46%)", display: "flex" }} />
        <svg width="1200" height="200" viewBox="0 0 1200 220" style={{ position: "absolute", left: 0, bottom: 96, opacity: 0.35 }}>
          <path d="M-20 150C120 20 240 20 300 110S480 210 600 110 780 10 900 110 1080 200 1220 70" stroke="#FFD600" strokeWidth="8" strokeLinecap="round" fill="none" />
        </svg>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="84" height="56" viewBox="0 0 48 32">
            <path d="M5 23C5 7 17 7 17 17c0 13 14 13 14 0 0-10 12-10 12 6" stroke="#FFD600" strokeWidth="5" strokeLinecap="round" fill="none" />
            <circle cx="24" cy="5" r="3" fill="#F5F5F2" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>Domma</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#FFD600", letterSpacing: 6, marginTop: 4 }}>MART</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, fontWeight: 500, color: "#FFD600", marginBottom: 14 }}>{input.eyebrow}</div>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: input.title.length + (input.highlight?.length ?? 0) > 58 ? 62 : 74, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.04, maxWidth: 1020 }}>
            {input.title.split(" ").map((word, i) => (
              <span key={`t${i}`} style={{ marginRight: 18 }}>
                {word}
              </span>
            ))}
            {(input.highlight ?? "").split(" ").filter(Boolean).map((word, i) => (
              <span key={`h${i}`} style={{ color: "#FFD600", marginRight: 18 }}>
                {word}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 56, borderTop: "2px solid #2A2A2E", paddingTop: 26 }}>
          {input.footer.map((item) => (
            <div key={item.label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: "#FFD600" }}>{item.value}</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: "#9B9BA1" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Manrope", data: bold, weight: 800, style: "normal" },
        { name: "Manrope", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
