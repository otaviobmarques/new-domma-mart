"use client";

import { Button, Logo } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <Logo />
      <h1 className="mt-4 text-xl font-extrabold">Tivemos um problema do nosso lado</h1>
      <p className="text-muted">Nada foi perdido. Tente de novo em instantes.</p>
      <Button onClick={reset}>Tentar de novo</Button>
    </main>
  );
}
