import { useMemo, useState } from "react";
import { useDimensions, useStageDescriptions, useTransitionCycle } from "@/hooks/useCycleData";
import { useTeamAnchors } from "@/hooks/useAnchors";
import { usePreSessionAssessments, useSavePreSessionAssessment } from "@/hooks/usePreSession";
import { isPreSessionComplete, preSessionProgress } from "@/lib/preSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

export default function PreSessionEditor({
  teamId,
  cycleId,
  facilitator,
}: {
  teamId: string;
  cycleId: string;
  facilitator: boolean;
}) {
  const { data: dimensions = [] } = useDimensions();
  const { data: descriptions = [] } = useStageDescriptions();
  const { data: anchors = [] } = useTeamAnchors(teamId);
  const { data: saved = [] } = usePreSessionAssessments(cycleId);
  const save = useSavePreSessionAssessment(cycleId);
  const transition = useTransitionCycle(teamId, cycleId);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftStage, setDraftStage] = useState<Record<string, number>>({});
  const [draftRationale, setDraftRationale] = useState<Record<string, string>>({});

  const savedByDim = useMemo(() => new Map(saved.map((a) => [a.dimension_id, a])), [saved]);
  const stagesByDim = useMemo(() => {
    const m = new Map<string, typeof descriptions>();
    for (const d of descriptions) {
      const arr = m.get(d.dimension_id) ?? [];
      arr.push(d);
      m.set(d.dimension_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.stage_number - b.stage_number);
    return m;
  }, [descriptions]);
  const anchorsByDim = useMemo(() => {
    const m = new Map<string, typeof anchors>();
    for (const a of anchors) {
      const arr = m.get(a.dimension_id) ?? [];
      arr.push(a);
      m.set(a.dimension_id, arr);
    }
    return m;
  }, [anchors]);

  const dimensionIds = useMemo(() => dimensions.map((d) => d.id), [dimensions]);
  const { done, total } = preSessionProgress(dimensionIds, saved);
  const complete = isPreSessionComplete(dimensionIds, saved);

  const stageOf = (dimId: string): number | null =>
    draftStage[dimId] ?? savedByDim.get(dimId)?.sm_stage ?? null;
  const rationaleOf = (dimId: string): string =>
    draftRationale[dimId] ?? savedByDim.get(dimId)?.rationale ?? "";

  const canSaveDim = (dimId: string): boolean => {
    const s = stageOf(dimId);
    return facilitator && s != null && s >= 1 && s <= 4 && rationaleOf(dimId).trim().length > 0;
  };

  if (!facilitator) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        Pré-sessão em preparação pelo facilitador. Aguarde o início da sessão.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Pré-sessão</h2>
          <p className="text-xs text-venice-textTertiary">
            Sua análise prévia por dimensão (estágio + argumento). Congela ao iniciar a sessão.
          </p>
        </div>
        <span className="font-mono text-xs text-venice-textSecondary">{done}/{total}</span>
      </div>

      <div className="space-y-2">
        {dimensions.map((dim) => {
          const stages = stagesByDim.get(dim.id) ?? [];
          const dimAnchors = anchorsByDim.get(dim.id) ?? [];
          const isOpen = expanded === dim.id;
          const activeStage = stageOf(dim.id);
          const savedRow = savedByDim.get(dim.id);

          return (
            <div key={dim.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <button
                className="flex w-full items-center gap-3 p-4 text-left"
                onClick={() => setExpanded(isOpen ? null : dim.id)}
              >
                <span className="text-xs text-venice-textTertiary">{dim.axis_name}</span>
                <b className="min-w-0 flex-1 text-sm">{dim.name}</b>
                {savedRow ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-venice-okBg px-3 py-1 text-xs font-medium text-venice-okFg">
                    <Check className="h-3 w-3" /> {savedRow.sm_stage}
                  </span>
                ) : (
                  <span className="text-xs text-venice-textTertiary">pendente</span>
                )}
                <ChevronDown className={cn("h-4 w-4 text-venice-textTertiary transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border p-4">
                  {dimAnchors.length > 0 && (
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-2 text-xs font-medium text-venice-textSecondary">Indicadores</p>
                      <ul className="space-y-1">
                        {dimAnchors.map((a) => (
                          <li key={a.id} className="flex items-center justify-between text-xs">
                            <span className="text-venice-textSecondary">{a.name}</span>
                            <span className="font-mono">
                              {a.value ?? "—"}{a.unit ? ` ${a.unit}` : ""} · {a.verdict}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {stages.map((s) => {
                      const selected = activeStage != null && activeStage === s.stage_number;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setDraftStage((d) => ({ ...d, [dim.id]: s.stage_number }))}
                          className={cn(
                            "rounded-xl border-[1.5px] p-4 text-left transition-all",
                            selected ? "border-venice-accent bg-venice-okBg" : "border-border bg-card hover:border-venice-textTertiary",
                          )}
                        >
                          <b className="text-sm">Estágio {s.stage_number} — {s.short_text}</b>
                          <p className="mt-1 text-xs leading-relaxed text-venice-textSecondary">{s.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  <Textarea
                    placeholder="Argumento: por que este estágio, com base nos indicadores…"
                    value={rationaleOf(dim.id)}
                    onChange={(e) => setDraftRationale((d) => ({ ...d, [dim.id]: e.target.value }))}
                    rows={3}
                  />

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!canSaveDim(dim.id) || save.isPending}
                      onClick={() =>
                        save.mutate({
                          dimensionId: dim.id,
                          smStage: stageOf(dim.id)!,
                          rationale: rationaleOf(dim.id).trim(),
                        })
                      }
                    >
                      Salvar dimensão
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {!complete && (
          <span className="text-xs text-venice-textTertiary">Preencha as {total} dimensões para iniciar a sessão.</span>
        )}
        <Button disabled={!complete || transition.isPending} onClick={() => transition.mutate("session")}>
          Iniciar sessão com o time
        </Button>
      </div>
    </div>
  );
}
