import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useKaizens, useMoveKaizen, useCreateKaizen, type KaizenRow } from "@/hooks/useCycleData";
import { useDimensions } from "@/hooks/useCycleData";
import { useTeamLevels } from "@/hooks/useTeamLevels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const COLUMNS: { key: KaizenRow["status"]; label: string }[] = [
  { key: "backlog", label: "Priorizados" },
  { key: "doing", label: "Em andamento" },
  { key: "done", label: "Concluídos" },
];

export default function Plano() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: kaizens = [], isLoading } = useKaizens(teamId);
  const { data: dimensions = [] } = useDimensions();
  const { data: levels = {} } = useTeamLevels(teamId ? [teamId] : []);
  const moveKaizen = useMoveKaizen(teamId!);
  const createKaizen = useCreateKaizen(teamId!);
  const quarter = teamId ? levels[teamId]?.quarter : undefined;

  const [newTitle, setNewTitle] = useState("");
  const [pendingDone, setPendingDone] = useState<KaizenRow | null>(null);
  const [resultValue, setResultValue] = useState("");

  const dimName = useMemo(() => new Map(dimensions.map((d) => [d.id, d.name])), [dimensions]);
  const byColumn = useMemo(() => {
    const m: Record<string, KaizenRow[]> = { backlog: [], doing: [], done: [] };
    for (const k of kaizens) m[k.status]?.push(k);
    return m;
  }, [kaizens]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const kaizen = kaizens.find((k) => k.id === result.draggableId);
    const newStatus = result.destination.droppableId as KaizenRow["status"];
    if (!kaizen || kaizen.status === newStatus) return;

    if (newStatus === "done" && kaizen.target_value != null) {
      setPendingDone(kaizen);
      setResultValue("");
      return;
    }
    moveKaizen.mutate({ id: kaizen.id, status: newStatus });
  };

  if (isLoading) return <p className="text-sm text-venice-textTertiary">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-[19px]">
              Plano de evolução · kaizens{quarter ? ` ${quarter}` : ""}
            </h2>
            <p className="mt-1 text-sm text-venice-textTertiary">
              Gerados dos estágios homologados · cada card tem baseline e métrica-alvo
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Novo kaizen…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-56"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) {
                  createKaizen.mutate(newTitle.trim());
                  setNewTitle("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="border border-border bg-transparent text-venice-textSecondary"
              onClick={() => {
                if (newTitle.trim()) {
                  createKaizen.mutate(newTitle.trim());
                  setNewTitle("");
                }
              }}
            >
              + Kaizen
            </Button>
          </div>
        </div>
      </div>

      {kaizens.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-venice-textTertiary">
          Nenhum kaizen ainda. Eles nascem automaticamente ao oficializar um ciclo, ou você pode criar um manual acima.
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <Droppable key={col.key} droppableId={col.key}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="rounded-xl border border-border bg-venice-surface2 p-3"
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">
                    {col.label} · {byColumn[col.key]?.length ?? 0}
                  </h3>
                  <div className="mt-3 min-h-[60px] space-y-2">
                    {byColumn[col.key]?.map((k, i) => (
                      <Draggable key={k.id} draggableId={k.id} index={i}>
                        {(dragProvided) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              "rounded-[10px] border border-border bg-card p-3 shadow-sm",
                              k.status === "done" && "opacity-70"
                            )}
                          >
                            <b className="text-[12.5px] font-bold">{k.title}</b>
                            {(k.dimension_id || (k.from_stage != null && k.to_stage != null)) && (
                              <p className="mt-1 text-xs text-venice-textTertiary">
                                {k.dimension_id && dimName.get(k.dimension_id)}
                                {k.dimension_id && k.from_stage != null && k.to_stage != null && " · "}
                                {k.from_stage != null && k.to_stage != null && (
                                  <span className="font-medium text-venice-accentStrong">
                                    {k.from_stage} → {k.to_stage}
                                  </span>
                                )}
                              </p>
                            )}
                            {(k.baseline_value != null || k.target_value != null) && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {k.baseline_value != null && (
                                  <span className="rounded-full bg-venice-errBg px-2.5 py-0.5 text-[11px] font-medium text-venice-errFg">
                                    baseline {k.baseline_value}
                                  </span>
                                )}
                                {k.target_value != null && (
                                  <span className="rounded-full bg-venice-surface3 px-2.5 py-0.5 text-[11px] font-medium text-venice-textTertiary">
                                    alvo {k.target_value}
                                  </span>
                                )}
                              </div>
                            )}
                            {k.status === "done" && k.result_value != null && (
                              <p className="mt-1 text-xs text-venice-okFg">
                                Impacto: {k.baseline_value ?? "?"} → {k.result_value}
                              </p>
                            )}
                            {k.due_date && <p className="mt-1 text-[11px] text-venice-textTertiary">até {k.due_date}</p>}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <Dialog open={!!pendingDone} onOpenChange={(open) => !open && setPendingDone(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir kaizen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-venice-textSecondary">
            Baseline {pendingDone?.baseline_value ?? "?"} → alvo {pendingDone?.target_value ?? "?"}. Qual foi o resultado
            observado?
          </p>
          <Input
            type="number"
            step="0.1"
            placeholder="Valor observado"
            value={resultValue}
            onChange={(e) => setResultValue(e.target.value)}
          />
          <DialogFooter>
            <Button
              onClick={() => {
                if (pendingDone) {
                  moveKaizen.mutate({ id: pendingDone.id, status: "done", resultValue: resultValue ? Number(resultValue) : null });
                }
                setPendingDone(null);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
