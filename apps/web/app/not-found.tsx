import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <Logo />
      <h1 className="mt-4 text-xl font-extrabold">Não encontramos esta página</h1>
      <p className="text-muted">O endereço pode ter mudado ou você pode não ter acesso a ele.</p>
      <Link href="/compras" className="font-bold text-accent underline underline-offset-4">
        Ir para minhas compras
      </Link>
    </main>
  );
}
