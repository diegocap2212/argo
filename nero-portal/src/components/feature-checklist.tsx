"use client";

import { useOptimistic, useTransition, useState } from "react";
import { CheckSquare, Square, ChevronDown, ChevronRight, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleChecklistAction, setFeatureStatusAction } from "@/app/roadmap/actions";
import type { Prisma } from "@prisma/client";

type Feature = Prisma.FeatureGetPayload<{ include: { checklist: true } }>;
type RiskRow = Prisma.RiskGetPayload<object>;

const SEV_CHIP: Record<string, string> = {
  Alta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Média: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Baixa: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  nao_iniciada: "Não iniciada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  bloqueada: "Bloqueada",
};

const STATUS_COLORS: Record<string, string> = {
  nao_iniciada: "bg-muted text-muted-foreground",
  em_andamento: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  concluida: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  bloqueada: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

type ChecklistItemRow = Feature["checklist"][number];

function ChecklistRow({
  item,
  slug,
}: {
  item: ChecklistItemRow;
  slug: string;
}) {
  const [optimisticDone, setOptimisticDone] = useOptimistic(item.done);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !optimisticDone;
    startTransition(async () => {
      setOptimisticDone(next);
      await toggleChecklistAction(item.id, next, slug);
    });
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
    >
      {optimisticDone ? (
        <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      ) : (
        <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("flex-1 leading-snug", optimisticDone && "line-through text-muted-foreground")}>
        {item.texto}
      </span>
    </button>
  );
}

function FeatureCard({ feature, risks, slug, expanded, onToggle }: {
  feature: Feature;
  risks: RiskRow[];
  slug: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const done = feature.checklist.filter((c) => c.done).length;
  const total = feature.checklist.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const [, startTransition] = useTransition();

  function cycleStatus() {
    const order = ["nao_iniciada", "em_andamento", "concluida", "bloqueada"];
    const idx = order.indexOf(feature.status);
    const next = order[(idx + 1) % order.length];
    startTransition(() => setFeatureStatusAction(feature.codigo, next, slug));
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onToggle}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="expandir"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{feature.codigo}</span>
            <span className="text-sm font-medium leading-snug">{feature.titulo}</span>
            {feature.dependeLM && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Dep. LM
              </span>
            )}
          </div>
          {feature.areaDama && (
            <p className="mt-0.5 text-xs text-muted-foreground">{feature.areaDama}</p>
          )}
          {risks.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-red-500" />
              {risks.map((r) => (
                <span
                  key={r.id}
                  title={r.descricao}
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    SEV_CHIP[r.severidade] ?? SEV_CHIP.Baixa,
                  )}
                >
                  {r.codigo} · {r.severidade}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            onClick={cycleStatus}
            title="Clique para avançar o status"
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
              STATUS_COLORS[feature.status] ?? "bg-muted text-muted-foreground",
            )}
          >
            {STATUS_LABELS[feature.status] ?? feature.status}
          </button>
          {pct !== null && (
            <span className="text-xs text-muted-foreground">{done}/{total} ✓</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div className="mx-3 mb-2 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Detalhe expandido: checklist + riscos do epic + trilho paralelo */}
      {expanded && (feature.checklist.length > 0 || risks.length > 0 || feature.trilhoParalelo) && (
        <div className="border-t px-3 pb-2 pt-2">
          {feature.checklist.length > 0 && (
            <>
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist</p>
              <div className="space-y-0.5">
                {feature.checklist.map((item) => (
                  <ChecklistRow key={item.id} item={item} slug={slug} />
                ))}
              </div>
            </>
          )}

          {risks.length > 0 && (
            <div className={cn(feature.checklist.length > 0 && "mt-2 border-t pt-2")}>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <ShieldAlert className="h-3 w-3" />
                Riscos deste epic
              </p>
              <div className="space-y-1">
                {risks.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-muted-foreground">{r.codigo}</span> {r.descricao}
                      {r.mitigacao && (
                        <span className="block text-muted-foreground">
                          <span className="font-medium">Mitigação:</span> {r.mitigacao}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        SEV_CHIP[r.severidade] ?? SEV_CHIP.Baixa,
                      )}
                    >
                      {r.severidade}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {feature.trilhoParalelo && (
            <p className="mt-2 text-xs text-muted-foreground border-t pt-2">
              <span className="font-medium">Trilho paralelo:</span> {feature.trilhoParalelo}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FeatureChecklist({
  features,
  slug,
  risksByFeature = {},
}: {
  features: Feature[];
  slug: string;
  risksByFeature?: Record<string, RiskRow[]>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (features.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhuma feature cadastrada para esta fase.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {features.map((f) => (
        <FeatureCard
          key={f.id}
          feature={f}
          risks={risksByFeature[f.id] ?? []}
          slug={slug}
          expanded={expandedIds.has(f.id)}
          onToggle={() => toggle(f.id)}
        />
      ))}
    </div>
  );
}
