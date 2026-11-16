"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

export type Theme = "dark" | "light";

/** Lê o modo atual e avisa quando ele muda (o botão pode estar em outro ponto da página). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** Alterna entre modo claro e modo noturno. A escolha fica salva neste aparelho. */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Modo claro" : "Modo noturno";
  return (
    <button
      type="button"
      aria-label={`Mudar para o ${label.toLowerCase()}`}
      title={label}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("dm-theme", next);
        } catch {}
      }}
      className={cx("inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-paper/80 transition hover:bg-raised hover:text-paper", withLabel ? "w-full justify-start px-3" : "w-9", className)}
    >
      {next === "light" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      {withLabel && label}
    </button>
  );
}
