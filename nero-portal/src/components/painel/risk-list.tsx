"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PainelRisk } from "@/lib/painel/queries";

export function RiskList({ risks }: { risks: PainelRisk[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (risks.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum risco ativo.</p>;
  }

  return (
    <div className="space-y-2">
      {risks.map((r) => {
        const alta = r.severidade === "Alta";
        const isOpen = open === r.codigo;
        return (
          <button
            key={r.codigo}
            onClick={() => setOpen(isOpen ? null : r.codigo)}
            aria-expanded={isOpen}
            className="flex w-full flex-col rounded-lg border bg-card p-3 text-left transition-colors hover:border-muted-foreground/40"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn("h-7 w-1 shrink-0 rounded-full", alta ? "bg-error" : "bg-warning")}
              />
              <span className="font-mono text-xs font-bold text-muted-foreground">{r.codigo}</span>
              <span className="flex-1 text-[13px] leading-snug">{r.descricao}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  alta ? "bg-error/10 text-error" : "bg-warning/10 text-warning",
                )}
              >
                {r.severidade}
              </span>
            </div>
            <div
              className={cn(
                "grid transition-all duration-300",
                isOpen ? "mt-2.5 grid-rows-[1fr] border-t border-dashed pt-2.5" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold">Mitigação:</span> {r.mitigacao ?? "—"}
                {r.dono ? (
                  <>
                    {" · "}
                    <span className="font-semibold">Dono:</span> {r.dono}
                  </>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
