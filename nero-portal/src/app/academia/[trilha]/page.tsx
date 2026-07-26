import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Target } from "lucide-react";
import { loadTrilha } from "@/lib/academia/trilhas";
import { NeroChat } from "@/components/nero-chat";
import { NeroLogo } from "@/components/nero-logo";
import { StepDoneButton, StepList } from "@/components/trilha-progress";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v || undefined;

export default async function TrilhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ trilha: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ trilha: trilhaSlug }, sp] = await Promise.all([params, searchParams]);
  const trilha = await loadTrilha(trilhaSlug);
  if (!trilha || trilha.steps.length === 0) notFound();

  const passo = first(sp.passo);
  const step = trilha.steps.find((s) => s.slug === passo) ?? trilha.steps[0];
  const next = trilha.steps[step.ordem + 1] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <Link
        href="/academia"
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Academia
      </Link>

      <div className="mb-6">
        <h1 className="font-serif text-xl font-semibold tracking-tight">{trilha.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {trilha.publico} · {trilha.duracao}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr_380px]">
        {/* Passos */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Passos
          </h2>
          <StepList
            trilhaSlug={trilha.slug}
            steps={trilha.steps.map((s) => ({ slug: s.slug, titulo: s.titulo }))}
            currentSlug={step.slug}
          />
        </aside>

        {/* Conteúdo do passo */}
        <section className="min-w-0">
          <div className="rounded-2xl border bg-card p-5">
            <div className="mb-4 border-b pb-4">
              <div className="text-xs font-medium text-muted-foreground">
                Passo {step.ordem + 1} de {trilha.steps.length}
              </div>
              <h2 className="mt-1 font-serif text-lg font-semibold tracking-tight">{step.titulo}</h2>
              {step.objetivo && (
                <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  {step.objetivo}
                </p>
              )}
            </div>
            <article className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.body}</ReactMarkdown>
            </article>
            <div className="mt-5 flex items-center justify-end border-t pt-4">
              <StepDoneButton
                trilhaSlug={trilha.slug}
                stepSlug={step.slug}
                nextStepSlug={next?.slug ?? null}
              />
            </div>
          </div>
        </section>

        {/* Tutor */}
        <div className="flex flex-col overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-20 lg:h-[calc(100vh-10rem)]">
          <div className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <NeroLogo size={24} />
              <span className="text-sm font-medium">Nero · tutor desta aula</span>
            </div>
          </div>
          <NeroChat
            key={step.slug}
            scope={{
              trilhaSlug: trilha.slug,
              stepSlug: step.slug,
              label: `aula "${step.titulo}"`,
              hint: "Sou seu tutor neste passo — pergunte qualquer coisa, peça exemplos ou um exercício.",
              suggestions: [
                "Me guie por este passo do começo.",
                "Me dá um exemplo prático disso com dados do LM?",
                "Me passa um exercício rápido para testar se entendi.",
              ],
            }}
          />
        </div>
      </div>
    </div>
  );
}
