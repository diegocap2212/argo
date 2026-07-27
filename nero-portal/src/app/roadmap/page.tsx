import { loadRoadmap } from "@/lib/state/queries";
import { RoadmapStepper } from "@/components/roadmap-stepper";
import { ProjetoTabs } from "@/components/projeto-tabs";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const phases = await loadRoadmap();

  const totalFeatures = phases.reduce((s, p) => s + p.totalFeatures, 0);
  const doneFeatures = phases.reduce((s, p) => s + p.doneFeatures, 0);
  const activePhases = phases.filter((p) => p.rag !== "cinza").length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <ProjetoTabs />
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-tight">Fases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            24 semanas · 7 fases · clique numa fase para o painel 360° + Nero contextual
          </p>
        </div>
        <div className="flex shrink-0 gap-4 text-right">
          <div>
            <p className="font-serif text-2xl font-semibold tabular-nums">{activePhases}</p>
            <p className="text-xs text-muted-foreground">fases ativas</p>
          </div>
          <div>
            <p className="font-serif text-2xl font-semibold tabular-nums">{doneFeatures}/{totalFeatures}</p>
            <p className="text-xs text-muted-foreground">features</p>
          </div>
        </div>
      </div>

      <RoadmapStepper phases={phases} />

      <p className="mt-6 text-xs text-center text-muted-foreground">
        Clique num step para ver features, checklist, dependências e conversar com o Nero naquele contexto.
      </p>
    </div>
  );
}
