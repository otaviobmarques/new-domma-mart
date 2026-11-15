"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass, cx } from "@/components/ui";

export function CopyButton({ text, label = "Copiar link", full, variant = "outline" }: { text: string; label?: string; full?: boolean; variant?: "outline" | "primary" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cx(buttonClass({ variant, size: "md", full }))}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? "Copiado" : label}
    </button>
  );
}
