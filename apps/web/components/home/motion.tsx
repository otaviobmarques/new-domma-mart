"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/** Revela o conteúdo quando ele entra na tela. Sem JavaScript ou com movimento reduzido, aparece direto. */
export function Reveal({ children, delay = 0, className, as: Tag = "div", theme }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section"; theme?: "dark" | "light" }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // biome-ignore lint: elemento dinâmico
    <Tag ref={ref as never} data-theme={theme} className={cx("reveal", visible && "is-visible", className)} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Número que conta até o valor quando aparece na tela. */
export function CountUp({ cents, className }: { cents: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(cents);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setValue(0);
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1400);
        setValue(Math.round(cents * (1 - (1 - t) ** 3)));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [cents]);
  return (
    <span ref={ref} className={cx("num", className)}>
      {(value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
    </span>
  );
}
