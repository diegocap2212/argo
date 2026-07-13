import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useDimensions,
  useStageDescriptions,
  useLatestCycle,
  useProposals,
  useHomologations,
  useSaveHomologation,
  useOfficializeCycle,
  useTransitionCycle,
} from "@/hooks/useCycleData";
import { useSquadRole } from "@/hooks/useSquadRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, errMessage } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export default function Homologacao() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: dimensions = [], isLoading: loadingDims } = useDimensions();
  const { data: stageDescriptions = [], isLoading: loadingStages } = useStageDescriptions();
  const { data: cycle, isLoading: loadingCycle } = useLatestCycle(teamId);
  const role = useSquadRole(teamId);
  const { data: proposals = [] } = useProposals(cycle?.id);
  const { data: homologations = [] } = useHomologations(cycle?.id);
  const saveHomologation = useSaveHomologation(cycle?.id ?? "");
  const officialize = useOfficializeCycle(teamId!, cycle?.id ?? "");
  const transition = useTransitionCycle(teamId!, cycle?.id);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [adjustStage, setAdjustStage] = useState<number | null>(null);
  const [justification, setJustification] = useState("");

  const proposalsByDim = useMemo(() => new Map(proposals.map((p) => [p.dimension_id, p])), [proposals]);
  const homologByDim = useMemo(() => new Map(homologations.map((h) => [h.dimension_id, h])), [homologations]);
  const stageByDimension = useMemo(
    () => new Map(stageDescriptions.map((stage) => [`${stage.dimension_id}:${stage.stage_number}`, stage])),
    [stageDescriptions]
  );

  if (loadingDims || loadingStages || loadingCycle) return <p className="text-sm text-venice-textTertiary">Carregando…</p>;

  if (!role.isAM) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        Só o Agile Master homologa o ciclo.
      </div>
    );
  }

  if (!cycle || cycle.status !== "homologation") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        {cycle ? `Nada para homologar agora (status: ${cycle.status}).` : "Nenhum ciclo aberto."}
      </div>
    );
  }

  const reviewedCount = dimensions.filter((d) => homologByDim.has(d.id)).length;
  const allReviewed = reviewedCount === dimensions.length;

  const homologate = async (dimensionId: string, official: number, adjusted: boolean, notes: string | null) => {
    if (adjusted && !notes?.trim()) {
      toast({ title: "Justificativa obrigatória", description: "Ajustes precisam de uma justificativa.", variant: "destructive" });
      return;
    }
    await saveHomologation.mutateAsync({ dimensionId, officialStage: official, adjusted, justification: notes });
    setExpanded(null);
    setAdjustStage(null);
    setJustification("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-[19px]">Pacote do assessment · {cycle.quarter}</h2>
            <p className="mt-1 text-sm text-venice-textTertiary">
              Revise cada dimensão registrada na sessão antes de oficializar o assessment do squad.
            </p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-venice-accentSoft px-3 py-1 text-sm font-medium text-venice-accentSoftFg">
            {reviewedCount} de {dimensions.length} revisadas
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {dimensions.map((dim) => {
          const proposal = proposalsByDim.get(dim.id);
          const homolog = homologByDim.get(dim.id);
          const isOpen = expanded === dim.id;
          const needsAttention = proposal?.divergence && !homolog;
          const displayedStage = homolog?.official_stage ?? proposal?.stage;
          const meaning = displayedStage == null
            ? null
            : stageByDimension.get(`${dim.id}:${Math.floor(Number(displayedStage))}`);
          const adjustedMeaning = adjustStage == null
            ? null
            : stageByDimension.get(`${dim.id}:${Math.floor(Number(adjustStage))}`);

          if (!proposal) {
            return (
              <div key={dim.id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 opacity-60">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-venice-surface3 font-serif text-sm text-venice-textTertiary">
                  —
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm">{dim.name}</b>
                  <p className="text-xs text-venice-textTertiary">Sem proposta registrada nesta sessão.</p>
                </div>
                <span className="text-xs text-venice-textTertiary">sem proposta</span>
              </div>
            );
          }

          return (
            <div
              key={dim.id}
              className={cn(
                "rounded-xl border bg-card shadow-sm",
                needsAttention ? "border-venice-warn bg-venice-warnBg" : "border-border"
              )}
            >
              <div className="flex items-center gap-4 p-4">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-venice-surface3 font-serif text-sm">
                  {Number(displayedStage).toFixed(1)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm">{dim.name}</b>
                  <p className="text-xs text-venice-textTertiary">
                    {homolog?.adjusted
                      ? `Proposta ${Number(proposal.stage).toFixed(1)} → nota oficial ${Number(homolog.official_stage).toFixed(1)}`
                      : proposal.divergence
                        ? "Divergência entre notas — revise antes de homologar."
                        : "Consenso registrado na sessão."}
                  </p>
                  {meaning && <p className="mt-1 text-xs font-medium text-venice-textSecondary">{meaning.short_text}</p>}
                  {homolog?.justification && <p className="mt-1 text-xs italic text-venice-textTertiary">Justificativa: {homolog.justification}</p>}
                </div>
                {proposal.divergence && (
                  <span className="rounded-full bg-venice-warnBg px-2.5 py-0.5 text-[11px] font-medium text-venice-warnFg">divergência</span>
                )}
                {homolog ? (
                  <span className="rounded-full bg-venice-okBg px-2.5 py-0.5 text-[11px] font-medium text-venice-okFg">
                    homologada{homolog.adjusted ? " (ajustada)" : ""}
                  </span>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setExpanded(isOpen ? null : dim.id);
                        setAdjustStage(proposal.stage);
                      }}
                    >
                      Ajustar
                    </Button>
                    <Button size="sm" onClick={() => homologate(dim.id, proposal.stage, false, null)} disabled={saveHomologation.isPending}>
                      Homologar
                    </Button>
                  </div>
                )}
              </div>

              {isOpen && !homolog && (
                <div className="space-y-3 border-t border-border p-4">
                  {adjustedMeaning && (
                    <div className="rounded-xl bg-secondary p-3">
                      <b className="text-xs">O que significa o estágio {Math.floor(Number(adjustStage))}</b>
                      <p className="mt-1 text-xs leading-relaxed text-venice-textSecondary">{adjustedMeaning.description}</p>
                      {adjustedMeaning.example && <p className="mt-2 text-xs text-venice-textTertiary">Exemplo: {adjustedMeaning.example}</p>}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-venice-textSecondary">Nota ajustada:</span>
                    {[1, 2, 3, 4].map((s) => (
                      <button
                        key={s}
                        onClick={() => setAdjustStage(s)}
                        className={cn(
                          "h-9 w-9 rounded-lg border text-sm font-semibold",
                          adjustStage === s ? "border-venice-accent bg-venice-okBg" : "border-border"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={4}
                      step={0.1}
                      value={adjustStage ?? proposal.stage}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) setAdjustStage(Math.min(4, Math.max(1, v)));
                      }}
                      className="w-20"
                    />
                  </div>
                  <Textarea
                    placeholder="Justificativa do ajuste (obrigatória)"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() => homologate(dim.id, adjustStage ?? proposal.stage, true, justification)}
                    disabled={saveHomologation.isPending}
                  >
                    Confirmar ajuste
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="accent"
              disabled={!allReviewed || officialize.isPending}
              onClick={async () => {
                try {
                  await officialize.mutateAsync();
                  toast({ title: "Ciclo oficializado", description: "O plano de evolução foi gerado." });
                } catch (e) {
                  toast({ title: "Erro ao oficializar", description: errMessage(e), variant: "destructive" });
                }
              }}
            >
              {officialize.isPending ? "Oficializando…" : `Oficializar assessment (${reviewedCount}/${dimensions.length})`}
            </Button>
            <Button variant="ghost" onClick={() => transition.mutate("session")} disabled={transition.isPending}>
              Devolver para a sessão
            </Button>
          </div>
          <p className="text-xs text-venice-textTertiary">
            Oficializar libera o Plano e registra o marco no comparativo.
          </p>
        </div>
      </div>
    </div>
  );
}
