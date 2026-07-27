"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLocalStorage, useLocalStorage } from "@/lib/use-local-storage";

/**
 * Progresso da trilha por navegador (localStorage) — v1 sem multiusuário,
 * mesmo princípio do PiiConsentGate. Chave: lista JSON de passos concluídos.
 */

const keyOf = (trilhaSlug: string) => `academia:progresso:${trilhaSlug}`;

function useDoneSteps(trilhaSlug: string): string[] {
  const raw = useLocalStorage(keyOf(trilhaSlug), "[]");
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function markDone(trilhaSlug: string, stepSlug: string, done: string[]) {
  if (!done.includes(stepSlug)) {
    setLocalStorage(keyOf(trilhaSlug), JSON.stringify([...done, stepSlug]));
  }
}

/** Chip "X/Y passos" com barra — usado na listagem de trilhas. */
export function TrilhaProgressChip({
  trilhaSlug,
  totalSteps,
}: {
  trilhaSlug: string;
  totalSteps: number;
}) {
  const done = useDoneSteps(trilhaSlug);
  const count = Math.min(done.length, totalSteps);
  const pct = totalSteps > 0 ? Math.round((count / totalSteps) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {count}/{totalSteps} passos
      </span>
    </div>
  );
}

/** Lista lateral de passos com estado (concluído / atual). */
export function StepList({
  trilhaSlug,
  steps,
  currentSlug,
}: {
  trilhaSlug: string;
  steps: { slug: string; titulo: string }[];
  currentSlug: string;
}) {
  const done = useDoneSteps(trilhaSlug);
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const isDone = done.includes(s.slug);
        const isCurrent = s.slug === currentSlug;
        return (
          <li key={s.slug}>
            <Link
              href={`/academia/${trilhaSlug}?passo=${s.slug}`}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                isCurrent
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  isDone
                    ? "bg-green-600 text-white"
                    : isCurrent
                      ? "bg-brand text-brand-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** Botão "Concluir passo": marca no progresso e navega para o próximo. */
export function StepDoneButton({
  trilhaSlug,
  stepSlug,
  nextStepSlug,
}: {
  trilhaSlug: string;
  stepSlug: string;
  nextStepSlug: string | null;
}) {
  const router = useRouter();
  const done = useDoneSteps(trilhaSlug);
  const isDone = done.includes(stepSlug);
  const isLast = nextStepSlug === null;

  const onClick = () => {
    markDone(trilhaSlug, stepSlug, done);
    if (nextStepSlug) router.push(`/academia/${trilhaSlug}?passo=${nextStepSlug}`);
  };

  if (isLast && isDone) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
        <PartyPopper className="h-4 w-4" />
        Trilha concluída — você fechou todos os passos!
      </div>
    );
  }

  return (
    <Button onClick={onClick} size="sm">
      {isLast ? "Concluir trilha" : isDone ? "Próximo passo" : "Concluir passo e avançar"}
      <ChevronRight className="h-4 w-4" />
    </Button>
  );
}
