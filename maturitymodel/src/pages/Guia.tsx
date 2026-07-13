import { useMemo, useState } from "react";
import { useAxes, useStages } from "@/hooks/useModelContent";
import { useDimensions, useStageDescriptions } from "@/hooks/useCycleData";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { AxisKey } from "@/types/mma";

export default function Guia() {
  const { data: axes = [] } = useAxes();
  const { data: stages = [] } = useStages();
  const { data: dimensions = [] } = useDimensions();
  const { data: descriptions = [] } = useStageDescriptions();

  const [activeAxis, setActiveAxis] = useState<AxisKey | "all">("all");

  const dimsByAxis = useMemo(
    () => (activeAxis === "all" ? dimensions : dimensions.filter((d) => d.axis_key === activeAxis)),
    [dimensions, activeAxis]
  );

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">Guia do modelo</h2>
        <p className="mt-1 text-sm text-venice-textSecondary">
          10 dimensões em 3 eixos, avaliadas em 4 estágios de maturidade — referência completa do MMA.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">Os 4 estágios</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map((s) => (
            <div key={s.number} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <span className="font-serif text-2xl">{s.number}</span>
              <b className="mt-1 block text-sm">{s.name}</b>
              <p className="text-xs text-venice-textTertiary">
                {s.legacy_name} · {s.tuckman}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-venice-textSecondary">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">Dimensões</h3>
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveAxis("all")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                activeAxis === "all" ? "border-venice-accent bg-venice-accentSoft text-venice-accentSoftFg" : "border-border text-venice-textSecondary"
              )}
            >
              Todos
            </button>
            {axes.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveAxis(a.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  activeAxis === a.key ? "border-venice-accent bg-venice-accentSoft text-venice-accentSoftFg" : "border-border text-venice-textSecondary"
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>

        <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card shadow-sm">
          {dimsByAxis.map((dim) => (
            <AccordionItem key={dim.id} value={dim.id} className="border-border px-4 last:border-b-0">
              <AccordionTrigger className="text-sm hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-venice-textTertiary">{dim.axis_name}</span>
                  <b>{dim.name}</b>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {dim.narrative && <p className="mb-4 text-sm italic text-venice-textSecondary">{dim.narrative}</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {descriptions
                    .filter((d) => d.dimension_id === dim.id)
                    .sort((a, b) => a.stage_number - b.stage_number)
                    .map((d) => (
                      <div key={d.id} className="rounded-lg border border-border bg-secondary p-3">
                        <b className="text-xs">
                          Estágio {d.stage_number} — {d.short_text}
                        </b>
                        <p className="mt-1 text-xs leading-relaxed text-venice-textSecondary">{d.description}</p>
                        {d.kaizen_hint && (
                          <p className="mt-1.5 text-[11px] text-venice-accentStrong">Kaizen: {d.kaizen_hint}</p>
                        )}
                      </div>
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
