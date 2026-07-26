"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PainelBlocker } from "@/lib/painel/queries";

const NIVEL: Record<string, { border: string; num: string; chip: string }> = {
  vermelho: { border: "border-l-error", num: "text-error", chip: "bg-error/10 text-error" },
  atencao: { border: "border-l-warning", num: "text-warning", chip: "bg-warning/10 text-warning" },
  ok: {
    border: "border-l-muted-foreground/40",
    num: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
};

export function Blockers({ blockers }: { blockers: PainelBlocker[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (blockers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Nenhum bloqueio aguardando o LM no momento.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {blockers.map((b) => {
        const nv = NIVEL[b.nivel] ?? NIVEL.ok;
        const isOpen = open === b.codigo;
        return (
          <button
            key={b.codigo}
            onClick={() => setOpen(isOpen ? null : b.codigo)}
            aria-expanded={isOpen}
            className={cn(
              "rounded-xl border border-l-4 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5",
              nv.border,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={cn("font-mono text-sm font-bold", nv.num)}>{b.codigo}</span>
                <p className="mt-1.5 text-sm leading-snug">{b.descricao}</p>
              </div>
              <div className="shrink-0 text-right">
                {b.agingDias == null ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", nv.chip)}>
                    sem SLA
                  </span>
                ) : (
                  <>
                    <div
                      className={cn(
                        "font-serif text-3xl font-semibold leading-none tabular-nums",
                        nv.num,
                      )}
                    >
                      {b.agingDias}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">dias úteis</div>
                  </>
                )}
              </div>
            </div>
            <div
              className={cn(
                "grid transition-all duration-300",
                isOpen ? "mt-3 grid-rows-[1fr] border-t border-dashed pt-3" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden text-xs leading-relaxed">
                {b.decisaoPedida && (
                  <p className="mb-2">
                    <span className="font-semibold text-muted-foreground">Precisamos: </span>
                    {b.decisaoPedida}
                  </p>
                )}
                {b.trilhoParalelo && (
                  <p>
                    <span className="font-semibold text-muted-foreground">Enquanto isso: </span>
                    {b.trilhoParalelo}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
