import { Check, ChevronLeft, Lock, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { completeLesson } from "@/app/buyer-actions";
import { Button, Card, cx } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Assistir" };

interface Lesson {
  id: string;
  title: string;
  description: string;
  video_url: string | null;
  duration_seconds: number | null;
  locked: boolean;
  unlock_at: string | null;
  completed: boolean;
}
interface Content {
  product: { id: string; name: string; description: string; type: string; seller_name: string };
  modules: { id: string; title: string; lessons: Lesson[] }[];
  progress: { total: number; done: number };
}

/** C06 — Área de membros simples: aula no topo, lista de aulas ao lado (ou abaixo, no celular). */
export default async function WatchPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ aula?: string }> }) {
  const { productId } = await params;
  await requireMe(`/assistir/${productId}`);
  let content: Content;
  try {
    content = await api<Content>(`/v1/buyer/products/${productId}/content`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const lessons = content.modules.flatMap((m, mi) => m.lessons.map((l) => ({ ...l, module: m.title, moduleIndex: mi + 1 })));
  const { aula } = await searchParams;
  // "Continuar de onde parou": a aula pedida ou a primeira ainda não concluída.
  const current = lessons.find((l) => l.id === aula && !l.locked) ?? lessons.find((l) => !l.completed && !l.locked) ?? lessons.find((l) => !l.locked);
  const index = current ? lessons.findIndex((l) => l.id === current.id) : -1;
  const next = lessons.slice(index + 1).find((l) => !l.locked) ?? null;
  const moduleLessons = current ? lessons.filter((l) => l.moduleIndex === current.moduleIndex) : [];

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-graphite">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/compras" className="flex min-w-0 items-center gap-1.5 font-bold">
            <ChevronLeft size={20} className="shrink-0" aria-hidden />
            <span className="truncate">{content.product.name}</span>
          </Link>
          {content.progress.total > 0 && (
            <span className="shrink-0 text-sm text-muted">
              {content.progress.done} de {content.progress.total}
            </span>
          )}
        </div>
      </header>

      {!current ? (
        <main className="mx-auto max-w-2xl px-4 py-8">
          <Card className="p-6 text-center">
            <h1 className="text-xl font-extrabold">{content.product.name}</h1>
            <p className="mt-2 text-muted">{content.product.description || "Seu acesso está liberado."}</p>
            <p className="mt-4 text-sm text-muted">
              {lessons.length ? `A primeira aula libera em ${formatDay(lessons[0]!.unlock_at!)}.` : `${content.product.seller_name} ainda está preparando o conteúdo. Avisamos por e-mail quando estiver no ar.`}
            </p>
          </Card>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:px-4 lg:py-6">
          <div>
            <div className="relative aspect-video w-full overflow-hidden bg-graphite lg:rounded-2xl lg:border lg:border-line">
              {current.video_url ? (
                <video key={current.id} src={current.video_url} controls controlsList="nodownload" playsInline className="size-full" />
              ) : (
                <div className="grid size-full place-items-center">
                  <div className="text-center">
                    <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand text-onbrand">
                      <Play size={24} fill="currentColor" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm text-muted">O vídeo desta aula ainda não foi enviado pelo produtor.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-4 lg:px-0">
              <p className="text-xs text-muted">
                Módulo {current.moduleIndex} · Aula {moduleLessons.findIndex((l) => l.id === current.id) + 1} de {moduleLessons.length}
              </p>
              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h1 className="text-2xl leading-tight font-extrabold">{current.title}</h1>
                <form action={completeLesson.bind(null, current.id, productId, next?.id ?? null)} className="shrink-0">
                  <Button full type="submit" size="lg" variant={current.completed ? "outline" : "primary"}>
                    <Check size={18} strokeWidth={3} aria-hidden />
                    {current.completed ? (next ? "Ir para a próxima" : "Aula concluída") : next ? "Concluir e ir para a próxima" : "Concluir aula"}
                  </Button>
                </form>
              </div>
              {current.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-muted">{current.description}</p>}
            </div>
          </div>

          <aside className="px-4 pb-8 lg:px-0">
            <Card className="p-3">
              {content.modules.map((m, mi) => (
                <section key={m.id} className={cx(mi > 0 && "mt-3 border-t border-line pt-3")}>
                  <h2 className="px-2 pb-1.5 text-sm font-bold">
                    Módulo {mi + 1}: {m.title}
                  </h2>
                  <ul>
                    {m.lessons.map((l, li) => {
                      const active = l.id === current.id;
                      const body = (
                        <>
                          <span className={cx("mt-0.5 shrink-0", l.completed ? "text-ok" : active ? "text-accent" : "text-muted")}>
                            {l.locked ? <Lock size={16} aria-hidden /> : l.completed ? <Check size={16} strokeWidth={3} aria-hidden /> : <Play size={16} aria-hidden />}
                          </span>
                          <span>
                            <span className={cx("block text-sm font-semibold", active && "text-accent")}>
                              {li + 1}. {l.title}
                            </span>
                            <span className="block text-xs text-muted">
                              {l.locked ? `Libera em ${formatDay(l.unlock_at!)}` : l.completed ? "Concluída" : active ? "Assistindo" : l.duration_seconds ? `${Math.round(l.duration_seconds / 60)} min` : "Disponível"}
                            </span>
                          </span>
                        </>
                      );
                      return (
                        <li key={l.id}>
                          {l.locked ? (
                            <div className="flex gap-3 rounded-lg px-2 py-2.5 opacity-70">{body}</div>
                          ) : (
                            <Link href={`/assistir/${productId}?aula=${l.id}`} aria-current={active ? "true" : undefined} className={cx("flex gap-3 rounded-lg px-2 py-2.5 hover:bg-raised", active && "bg-brand-dim")}>
                              {body}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </Card>
          </aside>
        </main>
      )}
    </div>
  );
}
