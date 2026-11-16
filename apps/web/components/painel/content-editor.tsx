"use client";

import { ArrowDown, ArrowUp, ChevronLeft, FileText, GripVertical, Pencil, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createLesson, createModule, deleteLesson, deleteModule, removeLessonVideo, renameModule, saveContentOrder, saveLesson } from "@/app/painel/actions";
import { Button, Card, Field, Notice, cx, inputClass } from "@/components/ui";
import { formatSize, uploadFile } from "@/lib/upload";

export interface EditorLesson {
  id: string;
  title: string;
  description: string;
  video_url: string | null;
  video_file?: { id: string; filename: string; size_bytes: number; preview_url: string } | null;
  duration_seconds: number | null;
  release_after_days: number;
  release_at: string | null;
  materials: { title: string; url: string }[];
}
export interface EditorModule {
  id: string;
  title: string;
  lessons: EditorLesson[];
}

type Drag = { kind: "lesson"; id: string } | { kind: "module"; id: string } | null;
const isHttps = (v: string) => /^https:\/\/[^\s"'<>]+$/i.test(v);
const dateInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10) : "");

/** P07 — Editor da área de membros: monte o curso arrastando e soltando. Toda mudança vale na hora para os alunos. */
export function ContentEditor({ productId, productName, initial }: { productId: string; productName: string; initial: EditorModule[] }) {
  const [modules, setModules] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.lessons[0]?.id ?? null);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newModule, setNewModule] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const lessonsTotal = modules.reduce((a, m) => a + m.lessons.length, 0);
  const current = modules.flatMap((m) => m.lessons).find((l) => l.id === selected) ?? null;
  const currentModule = modules.find((m) => m.lessons.some((l) => l.id === selected));

  /** Aplica a nova ordem na tela e salva. Se o servidor recusar, volta ao que estava. */
  const reorder = (next: EditorModule[]) => {
    const before = modules;
    setModules(next);
    setStatus(null);
    startTransition(async () => {
      const r = await saveContentOrder(productId, next.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) })));
      if (!r.ok) {
        setModules(before);
        setStatus({ tone: "bad", text: r.error });
      }
    });
  };

  const moveLesson = (lessonId: string, toModule: string, beforeLesson: string | null) => {
    if (lessonId === beforeLesson) return;
    const lesson = modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
    if (!lesson) return;
    reorder(
      modules.map((m) => {
        const rest = m.lessons.filter((l) => l.id !== lessonId);
        if (m.id !== toModule) return { ...m, lessons: rest };
        const at = beforeLesson ? rest.findIndex((l) => l.id === beforeLesson) : -1;
        return { ...m, lessons: at === -1 ? [...rest, lesson] : [...rest.slice(0, at), lesson, ...rest.slice(at)] };
      }),
    );
  };

  const moveModule = (moduleId: string, beforeModule: string) => {
    if (moduleId === beforeModule) return;
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return;
    const rest = modules.filter((m) => m.id !== moduleId);
    const at = rest.findIndex((m) => m.id === beforeModule);
    reorder([...rest.slice(0, at), mod, ...rest.slice(at)]);
  };

  // Mover pelos botões: funciona no celular e no teclado, onde não dá para arrastar.
  const stepLesson = (moduleIndex: number, lessonIndex: number, dir: -1 | 1) => {
    const mod = modules[moduleIndex]!;
    const lesson = mod.lessons[lessonIndex]!;
    const target = lessonIndex + dir;
    if (target >= 0 && target < mod.lessons.length) {
      const list = [...mod.lessons];
      [list[lessonIndex], list[target]] = [list[target]!, list[lessonIndex]!];
      return reorder(modules.map((m, i) => (i === moduleIndex ? { ...m, lessons: list } : m)));
    }
    const neighbour = modules[moduleIndex + dir];
    if (!neighbour) return;
    moveLesson(lesson.id, neighbour.id, dir === 1 ? (neighbour.lessons[0]?.id ?? null) : null);
  };
  const stepModule = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const list = [...modules];
    [list[index], list[target]] = [list[target]!, list[index]!];
    reorder(list);
  };

  const drop = (target: { module: string; lesson: string | null }) => {
    if (drag?.kind === "lesson") moveLesson(drag.id, target.module, target.lesson);
    else if (drag?.kind === "module") moveModule(drag.id, target.module);
    setDrag(null);
    setOver(null);
  };

  const addModule = () => {
    const title = newModule.trim();
    if (!title) return;
    startTransition(async () => {
      const r = await createModule(productId, title);
      if (!r.ok) return setStatus({ tone: "bad", text: r.error });
      setModules((list) => [...list, { id: r.id, title: r.title, lessons: [] }]);
      setNewModule("");
    });
  };

  const addLesson = (moduleId: string, count: number) => {
    startTransition(async () => {
      const title = `Aula ${count + 1}`;
      const r = await createLesson(moduleId, title);
      if (!r.ok) return setStatus({ tone: "bad", text: r.error });
      const lesson: EditorLesson = { id: r.id, title, description: "", video_url: null, duration_seconds: null, release_after_days: 0, release_at: null, materials: [] };
      setModules((list) => list.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, lesson] } : m)));
      setSelected(r.id);
    });
  };

  const removeModule = (mod: EditorModule) => {
    if (!window.confirm(mod.lessons.length ? `Excluir o módulo "${mod.title}" e as ${mod.lessons.length} aulas dele? Os alunos perdem o acesso a elas.` : `Excluir o módulo "${mod.title}"?`)) return;
    startTransition(async () => {
      const r = await deleteModule(mod.id);
      if (!r.ok) return setStatus({ tone: "bad", text: r.error });
      setModules((list) => list.filter((m) => m.id !== mod.id));
    });
  };

  const iconBtn = "grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-paper disabled:opacity-30";

  return (
    <div>
      <div className="mb-4">
        <Link href={`/painel/produtos/${productId}`} className="flex items-center gap-1 text-lg font-extrabold">
          <ChevronLeft size={20} aria-hidden /> Conteúdo do curso
        </Link>
        <p className="mt-0.5 pl-6 text-sm text-muted">
          {productName} · {modules.length} {modules.length === 1 ? "módulo" : "módulos"}, {lessonsTotal} {lessonsTotal === 1 ? "aula" : "aulas"}
        </p>
      </div>
      {status && (
        <div className="mb-4">
          <Notice tone={status.tone}>{status.text}</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        {/* Árvore de módulos e aulas */}
        <div className="min-w-0">
          <div className="space-y-2.5">
            {modules.map((mod, mi) => (
              <Card
                key={mod.id}
                className={cx("p-2", over === mod.id && "border-brand")}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setOver(mod.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop({ module: mod.id, lesson: null });
                }}
              >
                <div className="flex items-center gap-1" draggable={renaming !== mod.id} onDragStart={() => setDrag({ kind: "module", id: mod.id })} onDragEnd={() => setDrag(null)}>
                  <GripVertical size={16} className="shrink-0 cursor-grab text-muted" aria-hidden />
                  {renaming === mod.id ? (
                    <input
                      className={cx(inputClass, "h-9 text-sm")}
                      defaultValue={mod.title}
                      autoFocus
                      maxLength={120}
                      aria-label="Nome do módulo"
                      onBlur={(e) => {
                        const title = e.target.value.trim();
                        setRenaming(null);
                        if (!title || title === mod.title) return;
                        setModules((list) => list.map((m) => (m.id === mod.id ? { ...m, title } : m)));
                        startTransition(async () => {
                          const r = await renameModule(mod.id, title);
                          if (!r.ok) setStatus({ tone: "bad", text: r.error });
                        });
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <p className="min-w-0 flex-1 truncate px-1 text-sm font-bold">
                      {mi + 1}. {mod.title} <span className="font-normal text-muted">· {mod.lessons.length}</span>
                    </p>
                  )}
                  <button type="button" className={iconBtn} aria-label={`Renomear módulo ${mod.title}`} onClick={() => setRenaming(mod.id)}>
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button type="button" className={iconBtn} aria-label={`Mover módulo ${mod.title} para cima`} disabled={mi === 0} onClick={() => stepModule(mi, -1)}>
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button type="button" className={iconBtn} aria-label={`Mover módulo ${mod.title} para baixo`} disabled={mi === modules.length - 1} onClick={() => stepModule(mi, 1)}>
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button type="button" className={cx(iconBtn, "hover:text-bad")} aria-label={`Excluir módulo ${mod.title}`} onClick={() => removeModule(mod)}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>

                <ul className="mt-1">
                  {mod.lessons.map((lesson, li) => (
                    <li
                      key={lesson.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDrag({ kind: "lesson", id: lesson.id });
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => {
                        if (drag?.kind !== "lesson") return;
                        e.preventDefault();
                        e.stopPropagation();
                        setOver(lesson.id);
                      }}
                      onDrop={(e) => {
                        if (drag?.kind !== "lesson") return;
                        e.preventDefault();
                        e.stopPropagation();
                        drop({ module: mod.id, lesson: lesson.id });
                      }}
                      className={cx("flex items-center gap-1 rounded-lg border-t-2", over === lesson.id && drag?.kind === "lesson" ? "border-brand" : "border-transparent", selected === lesson.id && "bg-brand-dim")}
                    >
                      <GripVertical size={14} className="ml-1 shrink-0 cursor-grab text-muted" aria-hidden />
                      <button type="button" className={cx("min-w-0 flex-1 truncate py-2 text-left text-sm", selected === lesson.id ? "font-bold text-accent" : "text-paper/90")} aria-current={selected === lesson.id ? "true" : undefined} onClick={() => setSelected(lesson.id)}>
                        {lesson.title}
                      </button>
                      <button type="button" className={iconBtn} aria-label={`Mover aula ${lesson.title} para cima`} disabled={mi === 0 && li === 0} onClick={() => stepLesson(mi, li, -1)}>
                        <ArrowUp size={13} aria-hidden />
                      </button>
                      <button type="button" className={iconBtn} aria-label={`Mover aula ${lesson.title} para baixo`} disabled={mi === modules.length - 1 && li === mod.lessons.length - 1} onClick={() => stepLesson(mi, li, 1)}>
                        <ArrowDown size={13} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="mt-1 flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold text-accent" onClick={() => addLesson(mod.id, mod.lessons.length)}>
                  <Plus size={14} aria-hidden /> Nova aula
                </button>
              </Card>
            ))}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addModule();
            }}
          >
            <input className={cx(inputClass, "h-11 text-sm")} placeholder="Nome do novo módulo" aria-label="Nome do novo módulo" value={newModule} maxLength={120} onChange={(e) => setNewModule(e.target.value)} />
            <Button type="submit" variant="outline">
              <Plus size={15} aria-hidden /> Módulo
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">Arraste para mudar a ordem ou use as setas. As mudanças valem na hora para os alunos.</p>
        </div>

        {/* Aula selecionada */}
        {current ? (
          <LessonForm
            key={current.id}
            lesson={current}
            heading={`Aula ${(currentModule?.lessons.findIndex((l) => l.id === current.id) ?? 0) + 1} · ${currentModule?.title ?? ""}`}
            onSaved={(next) => setModules((list) => list.map((m) => ({ ...m, lessons: m.lessons.map((l) => (l.id === next.id ? next : l)) })))}
            onDeleted={(id) => {
              setModules((list) => list.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== id) })));
              setSelected(null);
            }}
          />
        ) : (
          <Card className="px-5 py-12 text-center">
            <p className="font-bold">{lessonsTotal ? "Escolha uma aula para editar" : "Comece criando um módulo e a primeira aula"}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Em cada aula você define título, descrição, vídeo, materiais de apoio e quando ela é liberada.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function LessonForm({ lesson, heading, onSaved, onDeleted }: { lesson: EditorLesson; heading: string; onSaved: (lesson: EditorLesson) => void; onDeleted: (id: string) => void }) {
  const [f, setF] = useState(lesson);
  const [rule, setRule] = useState<"now" | "days" | "date">(lesson.release_at ? "date" : lesson.release_after_days > 0 ? "days" : "now");
  const [date, setDate] = useState(dateInput(lesson.release_at));
  const [minutes, setMinutes] = useState(lesson.duration_seconds ? String(Math.round(lesson.duration_seconds / 60)) : "");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<EditorLesson>) => {
    setF({ ...f, ...patch });
    setMessage(null);
  };

  const save = () => {
    if (!f.title.trim()) return setMessage({ tone: "bad", text: "Dê um título à aula." });
    if (f.video_url && !isHttps(f.video_url)) return setMessage({ tone: "bad", text: "O endereço do vídeo precisa começar com https://" });
    const materials = f.materials.filter((m) => m.title.trim() || m.url.trim());
    if (materials.some((m) => !m.title.trim() || !isHttps(m.url))) return setMessage({ tone: "bad", text: "Cada material precisa de um nome e de um endereço que comece com https://" });
    if (rule === "date" && !date) return setMessage({ tone: "bad", text: "Escolha a data de liberação." });
    const next: EditorLesson = {
      ...f,
      title: f.title.trim(),
      video_url: f.video_url || null,
      duration_seconds: minutes ? Number(minutes) * 60 : null,
      release_after_days: rule === "days" ? Math.max(1, f.release_after_days) : 0,
      // Meia-noite no horário de Brasília.
      release_at: rule === "date" ? new Date(`${date}T03:00:00.000Z`).toISOString() : null,
      materials,
    };
    startTransition(async () => {
      const { id, video_file: _file, ...body } = next;
      const r = await saveLesson(id, body);
      if (!r.ok) return setMessage({ tone: "bad", text: r.error });
      setF(next);
      onSaved(next);
      setMessage({ tone: "ok", text: "Aula salva." });
    });
  };

  return (
    <Card className="min-w-0 space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate font-bold">{heading}</h2>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted hover:text-bad"
          onClick={() => {
            if (!window.confirm(`Excluir a aula "${lesson.title}"? Os alunos perdem o acesso a ela.`)) return;
            startTransition(async () => {
              const r = await deleteLesson(lesson.id);
              if (r.ok) onDeleted(lesson.id);
              else setMessage({ tone: "bad", text: r.error });
            });
          }}
        >
          <Trash2 size={14} aria-hidden /> Excluir aula
        </button>
      </div>
      <Field label="Título">
        <input className={inputClass} value={f.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Descrição">
        <textarea className={cx(inputClass, "h-28 py-2.5")} value={f.description} maxLength={5000} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      <VideoField
        lesson={f}
        onUploaded={(video_file) => {
          const next = { ...f, video_file, video_url: null };
          setF(next);
          onSaved({ ...lesson, video_file, video_url: null });
        }}
        onRemoved={() => {
          setF({ ...f, video_file: null });
          onSaved({ ...lesson, video_file: null });
        }}
        onUrl={(video_url) => set({ video_url })}
      />
      <Field label="Duração (min)">
        <input className={cx(inputClass, "num sm:w-36")} inputMode="numeric" placeholder="14" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Materiais de apoio</legend>
        <div className="space-y-2">
          {f.materials.map((m, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-2.5 sm:flex-row sm:items-center">
              <FileText size={16} className="hidden shrink-0 text-accent sm:block" aria-hidden />
              <input className={cx(inputClass, "h-10 text-sm sm:w-44")} placeholder="Nome (ex.: Resumo em PDF)" aria-label={`Nome do material ${i + 1}`} maxLength={120} value={m.title} onChange={(e) => set({ materials: f.materials.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <input className={cx(inputClass, "h-10 min-w-0 flex-1 text-sm")} placeholder="https://..." aria-label={`Endereço do material ${i + 1}`} inputMode="url" value={m.url} onChange={(e) => set({ materials: f.materials.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)) })} />
              <button type="button" className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-bad" aria-label={`Remover material ${i + 1}`} onClick={() => set({ materials: f.materials.filter((_, j) => j !== i) })}>
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {f.materials.length < 10 && (
          <button type="button" className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-accent" onClick={() => set({ materials: [...f.materials, { title: "", url: "" }] })}>
            <Plus size={15} aria-hidden /> Adicionar material
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Quando liberar esta aula</legend>
        <div className="space-y-2.5 text-sm">
          <label className="flex items-center gap-2.5">
            <input type="radio" name="release" className="size-4 accent-[var(--color-brand)]" checked={rule === "now"} onChange={() => setRule("now")} /> Logo depois da compra
          </label>
          <label className="flex flex-wrap items-center gap-2.5">
            <input type="radio" name="release" className="size-4 accent-[var(--color-brand)]" checked={rule === "days"} onChange={() => setRule("days")} /> Alguns dias depois da compra
            {rule === "days" && (
              <span className="flex items-center gap-2">
                <input className={cx(inputClass, "num h-9 w-20 text-sm")} inputMode="numeric" aria-label="Dias depois da compra" value={f.release_after_days || ""} onChange={(e) => set({ release_after_days: Math.min(3650, Number(e.target.value.replace(/\D/g, "")) || 0) })} /> dias
              </span>
            )}
          </label>
          <label className="flex flex-wrap items-center gap-2.5">
            <input type="radio" name="release" className="size-4 accent-[var(--color-brand)]" checked={rule === "date"} onChange={() => setRule("date")} /> Em uma data específica
            {rule === "date" && <input type="date" className={cx(inputClass, "h-9 w-auto text-sm")} aria-label="Data de liberação" value={date} onChange={(e) => setDate(e.target.value)} />}
          </label>
        </div>
      </fieldset>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button loading={pending} onClick={save}>
        Salvar aula
      </Button>
    </Card>
  );
}

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const VIDEO_MAX = 2 * 1024 ** 3;

/** Vídeo da aula: enviado para a área protegida da plataforma (recomendado) ou um endereço de fora. */
function VideoField({ lesson, onUploaded, onRemoved, onUrl }: { lesson: EditorLesson; onUploaded: (file: NonNullable<EditorLesson["video_file"]>) => void; onRemoved: () => void; onUrl: (url: string | null) => void }) {
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [external, setExternal] = useState(Boolean(lesson.video_url));
  const [pending, startTransition] = useTransition();

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!VIDEO_TYPES.includes(file.type)) return setError("Use um vídeo em MP4, WebM ou MOV.");
    if (file.size > VIDEO_MAX) return setError("O vídeo passa de 2 GB. Exporte com menos resolução ou divida em duas aulas.");
    setPercent(0);
    const r = await uploadFile(file, "lesson_video", { lessonId: lesson.id, onProgress: setPercent });
    setPercent(null);
    if (!r.ok) return setError(r.error);
    setExternal(false);
    onUploaded({ id: r.fileId, filename: file.name, size_bytes: r.sizeBytes, preview_url: URL.createObjectURL(file) });
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">Vídeo</p>
      {lesson.video_file ? (
        <div className="rounded-xl border border-line p-3">
          <video src={lesson.video_file.preview_url} controls controlsList="nodownload" playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-ink" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <ShieldCheck size={15} className="shrink-0 text-ok" aria-hidden />
              <span className="truncate">
                {lesson.video_file.filename} · {formatSize(lesson.video_file.size_bytes)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <label className="cursor-pointer font-semibold text-accent">
                Trocar
                <input type="file" className="sr-only" accept={VIDEO_TYPES.join(",")} disabled={percent !== null} onChange={(e) => send(e.target.files?.[0])} />
              </label>
              <button
                type="button"
                className="font-semibold text-muted hover:text-bad"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Tirar o vídeo desta aula? Os alunos deixam de ver.")) return;
                  startTransition(async () => {
                    const r = await removeLessonVideo(lesson.id);
                    if (r.ok) onRemoved();
                    else setError(r.error);
                  });
                }}
              >
                Remover
              </button>
            </span>
          </div>
        </div>
      ) : (
        <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-3.5 text-sm transition hover:bg-raised", percent !== null && "pointer-events-none")}>
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-raised text-accent">
            <Upload size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{percent !== null ? `Enviando… ${percent}%` : "Enviar vídeo do computador ou celular"}</span>
            <span className="block text-xs text-muted">MP4, WebM ou MOV, até 2 GB. Só quem comprou consegue assistir.</span>
          </span>
          <input type="file" className="sr-only" accept={VIDEO_TYPES.join(",")} disabled={percent !== null} onChange={(e) => send(e.target.files?.[0])} />
        </label>
      )}
      {percent !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {!lesson.video_file &&
        (external ? (
          <div className="mt-3">
            <input className={inputClass} inputMode="url" placeholder="https://..." aria-label="Endereço do vídeo" value={lesson.video_url ?? ""} onChange={(e) => onUrl(e.target.value.trim() || null)} />
            <p className="mt-1.5 text-xs text-muted">Endereço de um arquivo de vídeo hospedado fora. Atenção: quem tiver esse endereço consegue assistir sem comprar.</p>
          </div>
        ) : (
          <button type="button" className="mt-2 text-xs font-semibold text-muted underline underline-offset-4" onClick={() => setExternal(true)}>
            Prefiro usar um endereço de vídeo hospedado fora
          </button>
        ))}
    </div>
  );
}
