"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();

/** Registra o serviço do aplicativo (só em produção) e guarda o convite de instalação do navegador. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      pending = e as InstallEvent;
      listeners.forEach((fn) => fn());
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

/** Botão "Instalar aplicativo": só aparece quando o navegador permite instalar. */
export function InstallButton({ className }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const update = () => setAvailable(Boolean(pending));
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  if (!available) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const event = pending;
        if (!event) return;
        await event.prompt();
        await event.userChoice;
        pending = null;
        setAvailable(false);
      }}
    >
      <Download size={18} aria-hidden /> Instalar aplicativo
    </button>
  );
}
