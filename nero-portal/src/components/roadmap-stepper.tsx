import Link from "next/link";
import { ChevronRight, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoadmapPhase } from "@/lib/state/queries";

const RAG_DOT: Record<string, string> = {
  cinza: "bg-muted-foreground/50",
  amarelo: "bg-yellow-500",
  verde: "bg-green-500",
  vermelho: "bg-red-500",
};

const RAG_RING: Record<string, string> = {
  cinza: "border-border",
  amarelo: "border-yellow-400",
  verde: "border-green-400",
  vermelho: "border-red-400",
};

export function RoadmapStepper({ phases }: { phases: RoadmapPhase[] }) {
  return (
    <div className="relative">
      {/* Linha vertical */}
      <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />

      <div className="space-y-3">
        {phases.map((phase) => {
          const active = phase.rag !== "cinza";
          const href = phase.slug ? `/roadmap/${phase.slug}` : "#";
          const dotColor = RAG_DOT[phase.rag] ?? RAG_DOT.cinza;
          const ringColor = RAG_RING[phase.rag] ?? RAG_RING.cinza;
          const hasDepsAtRisk = phase.riskDepsCount > 0;
          const hasHighRisks = phase.highRisksCount > 0;

          return (
            <Link key={phase.id} href={href}>
              <div className="group flex items-start gap-4 rounded-xl p-3 transition-colors hover:bg-accent/60">
                {/* Bolinha */}
                <div
                  className={cn(
                    "relative z-10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors",
                    ringColor,
                    active && "shadow-sm",
                  )}
                >
                  <div className={cn("h-3 w-3 rounded-full transition-colors", dotColor)} />
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3
                        className={cn(
                          "text-sm font-medium leading-snug",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {phase.fase}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {phase.janela && <span>{phase.janela}</span>}
                        {phase.gate && (
                          <>
                            <span className="text-border">·</span>
                            <span className="font-mono">{phase.gate}</span>
                          </>
                        )}
                        {phase.foco && (
                          <>
                            <span className="text-border">·</span>
                            <span className="line-clamp-1">{phase.foco}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Badges de alerta + chevron */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {hasDepsAtRisk && (
                        <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {phase.riskDepsCount}
                        </span>
                      )}
                      {hasHighRisks && (
                        <span className="flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          {phase.highRisksCount}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  {phase.totalFeatures > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            phase.pctDerived === 100 ? "bg-green-500" : "bg-brand",
                          )}
                          style={{ width: `${phase.pctDerived}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {phase.doneFeatures}/{phase.totalFeatures} features
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
