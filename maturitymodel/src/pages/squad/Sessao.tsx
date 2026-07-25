import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useDimensions,
  useStageDescriptions,
  useLatestCycle,
  useProposals,
  useSaveProposal,
  useTransitionCycle,
} from "@/hooks/useCycleData";
import { useSquadRole } from "@/hooks/useSquadRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Presentation, Eye, ChevronDown } from "lucide-react";
import PreSessionEditor from "@/components/mma/PreSessionEditor";

const POLL_MS = 5000;

export default function Sessao() {
  const { teamId } = useParams<{ teamId: string }>();
  const role = useSquadRole(teamId);
  const facilitator = role.isSM || role.isAM;

  const { data: dimensions = [], isLoading: loadingDims } = useDimensions();
  const { data: descriptions = [] } = useStageDescriptions();
  // Participante acompanha em quase-tempo-real; facilitador não faz polling (evita brigar com a edição).
  const { data: cycle, isLoading: loadingCycle } = useLatestCycle(teamId, facilitator ? undefined : POLL_MS);
  const { data: proposals = [] } = useProposals(cycle?.id, facilitator ? undefined : POLL_MS);
  const saveProposal = useSaveProposal(cycle?.id ?? "");
  const transition = useTransitionCycle(teamId!, cycle?.id);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftStage, setDraftStage] = useState<Record<string, number>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const proposalsByDim = useMemo(() => new Map(proposals.map((p) => [p.dimension_id, p])), [proposals]);
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
  const axisGroups = useMemo(() => {
    const m = new Map<string, typeof dimensions>();
    for (const d of dimensions) {
      const arr = m.get(d.axis_name);
      if (arr) arr.push(d);
      else m.set(d.axis_name, [d]);
    }
    return Array.from(m.entries()).map(([axis, dims]) => ({ axis, dims }));
  }, [dimensions]);

  if (loadingDims || loadingCycle) return <p className="text-sm text-venice-textTertiary">Carregando…</p>;

  if (!role.isMember) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        Você não é membro deste squad.
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        Nenhum assessment em andamento. {facilitator ? "Inicie um pela Jornada." : "Aguarde o facilitador iniciar."}
      </div>
    );
  }

  if (cycle.status === "pre_session") {
    return <PreSessionEditor teamId={teamId!} cycleId={cycle.id} facilitator={facilitator} />;
  }

  if (cycle.status !== "session") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        {cycle.status === "homologation"
          ? "A sessão foi encerrada e o pacote está na homologação do Agile Master."
          : cycle.status === "official"
            ? "Este assessment já foi oficializado — veja o Plano e o Comparativo."
            : `Sessão indisponível (status: ${cycle.status}).`}
      </div>
    );
  }

  const closedCount = dimensions.filter((d) => proposalsByDim.has(d.id)).length;
  const allClosed = closedCount === dimensions.length && dimensions.length > 0;

  const closeConsensus = async (dimensionId: string) => {
    const stages = stagesByDim.get(dimensionId) ?? [];
    const existing = proposalsByDim.get(dimensionId);
    const stage = draftStage[dimensionId] ?? existing?.stage ?? stages[0]?.stage_number ?? 1;
    const notes = draftNotes[dimensionId] ?? existing?.notes ?? "";
    await saveProposal.mutateAsync({
      dimensionId,
      stage,
      decidedBy: "consensus",
      divergence: false,
      notes: notes.trim() || null,
    });
    setExpanded(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">Sessão de assessment · {cycle.quarter}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-venice-textSecondary">
            {facilitator ? (
              <>
                <Presentation className="h-4 w-4" /> Você conduz — apresente cada dimensão e registre a nota de consenso do grupo.
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" /> Acompanhando — as notas aparecem conforme o facilitador fecha cada dimensão.
              </>
            )}
          </p>
        </div>
        <div
          className="relative h-[54px] w-[54px] shrink-0 rounded-full"
          style={{
            background: `conic-gradient(var(--accent) calc(${
              dimensions.length ? (closedCount / dimensions.length) * 100 : 0
            }%), var(--surface-3) 0)`,
          }}
        >
          <div className="absolute inset-[6px] flex items-center justify-center rounded-full bg-card">
            <span className="font-mono text-xs font-semibold">
              {closedCount}/{dimensions.length}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {axisGroups.map(({ axis, dims }) => (
          <div key={axis} className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-serif text-[15px] text-venice-textSecondary">{axis}</span>
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[11px] text-venice-textTertiary">
                {dims.length} {dims.length === 1 ? "dimensão" : "dimensões"}
              </span>
            </div>

            <div className="space-y-2">
              {dims.map((dim) => {
                const stages = stagesByDim.get(dim.id) ?? [];
                const proposal = proposalsByDim.get(dim.id);
                const isOpen = expanded === dim.id;
                const activeStage = draftStage[dim.id] ?? proposal?.stage ?? null;

                return (
                  <div key={dim.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <button
                      className="flex w-full items-center gap-3 p-4 text-left"
                      onClick={() => setExpanded(isOpen ? null : dim.id)}
                    >
                      <span className="text-xs text-venice-textTertiary">{dim.axis_name}</span>
                      <b className="min-w-0 flex-1 text-sm">{dim.name}</b>
                      {proposal ? (
                        <span className="rounded-full bg-venice-okBg px-3 py-1 text-xs font-medium text-venice-okFg">
                          Consenso {Number(proposal.stage).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-venice-textTertiary">pendente</span>
                      )}
                      <ChevronDown className={cn("h-4 w-4 text-venice-textTertiary transition-transform", isOpen && "rotate-180")} />
                    </button>

                    {isOpen && (
                      <div className="border-t border-border p-4">
                        {dim.narrative && <p className="mb-4 text-sm italic text-venice-textSecondary">{dim.narrative}</p>}

                        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {stages.map((s) => {
                            const selected = activeStage != null && Math.floor(Number(activeStage)) === s.stage_number;
                            return (
                              <button
                                key={s.id}
                                disabled={!facilitator}
                                onClick={() => facilitator && setDraftStage((d) => ({ ...d, [dim.id]: s.stage_number }))}
                                className={cn(
                                  "rounded-xl border-[1.5px] p-4 text-left transition-all",
                                  selected ? "border-venice-accent bg-venice-okBg" : "border-border bg-card",
                                  facilitator && !selected && "hover:border-venice-textTertiary",
                                  !facilitator && "cursor-default"
                                )}
                              >
                                <b className="mb-1 block text-sm">
                                  Estágio {s.stage_number} — {s.short_text}
                                </b>
                                <p className="text-xs leading-relaxed text-venice-textSecondary">{s.description}</p>
                                {s.example && <p className="mt-2 text-xs text-venice-textTertiary">Ex.: {s.example}</p>}
                              </button>
                            );
                          })}
                        </div>

                        {facilitator ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-venice-textSecondary">Nota de consenso:</span>
                              {[1, 2, 3, 4].map((s) => (
                                <button
                                  key={s}
                                  onClick={() => setDraftStage((d) => ({ ...d, [dim.id]: s }))}
                                  className={cn(
                                    "h-9 w-9 rounded-lg border text-sm font-semibold",
                                    activeStage === s ? "border-venice-accent bg-venice-okBg" : "border-border"
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
                                value={activeStage ?? ""}
                                placeholder="—"
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  if (!Number.isNaN(v)) setDraftStage((d) => ({ ...d, [dim.id]: Math.min(4, Math.max(1, v)) }));
                                }}
                                className="w-20"
                              />
                            </div>
                            <Textarea
                              placeholder="Notas da discussão (opcional)"
                              value={draftNotes[dim.id] ?? proposal?.notes ?? ""}
                              onChange={(e) => setDraftNotes((d) => ({ ...d, [dim.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              onClick={() => closeConsensus(dim.id)}
                              disabled={saveProposal.isPending || activeStage == null}
                            >
                              {proposal ? "Atualizar consenso" : "Registrar consenso"}
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-border bg-secondary p-3 text-sm">
                            {proposal ? (
                              <>
                                <b>Consenso do grupo: Estágio {Number(proposal.stage).toFixed(1)}</b>
                                {proposal.notes && <p className="mt-1 text-venice-textSecondary">{proposal.notes}</p>}
                              </>
                            ) : (
                              <span className="text-venice-textTertiary">Aguardando o facilitador registrar o consenso desta dimensão.</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {facilitator && allClosed && (
        <div className="rounded-xl border border-venice-accent bg-venice-okBg p-4 text-center">
          <p className="mb-3 text-sm text-venice-okFg">As 10 dimensões têm nota de consenso registrada.</p>
          <Button variant="accent" onClick={() => transition.mutate("homologation")} disabled={transition.isPending}>
            {transition.isPending ? "Enviando…" : "Enviar para homologação"}
          </Button>
        </div>
      )}
    </div>
  );
}
