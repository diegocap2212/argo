"use client";

import { useCallback, useEffect, useState } from "react";

type Usage = {
  costUsd: number;
  budgetUsd: number;
  pct: number;
  turns: number;
  remainingDays: number;
  resetAt: string;
};

export function BudgetMeter() {
  const [u, setU] = useState<Usage | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/usage", { cache: "no-store" });
      if (r.ok) setU(await r.json());
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    // Carga inicial agendada fora do corpo síncrono do effect (regra
    // react-hooks/set-state-in-effect): o setState só acontece em callback.
    const initial = setTimeout(load, 0);
    const id = setInterval(load, 20000);
    const onUpdate = () => load();
    window.addEventListener("nero:usage-updated", onUpdate);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      window.removeEventListener("nero:usage-updated", onUpdate);
    };
  }, [load]);

  if (!u) return null;

  const tone = u.pct >= 90 ? "red" : u.pct >= 70 ? "amber" : "green";
  const dot =
    tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-emerald-500";

  const resetDate = u.resetAt
    ? new Date(u.resetAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "—";
  const tooltipText = `Consumo de API (interno) · $${u.costUsd.toFixed(3)} de $${u.budgetUsd.toFixed(0)} · ${u.turns} turnos · zera em ${resetDate}`;

  // Indicador discreto: um ponto de saúde + valor sutil. Detalhe completo no tooltip.
  return (
    <div
      className="hidden shrink-0 items-center gap-1.5 text-muted-foreground sm:flex"
      title={tooltipText}
      aria-label={tooltipText}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-[11px] tabular-nums">${u.costUsd.toFixed(2)}</span>
    </div>
  );
}
