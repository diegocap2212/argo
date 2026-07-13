import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { useQuarterComparison } from "@/hooks/useQuarterComparison";
import { useTeamLevels } from "@/hooks/useTeamLevels";
import { useKaizens } from "@/hooks/useCycleData";
import { useVisibleTeams } from "@/hooks/useTorreData";
import { cn } from "@/lib/utils";

/** Fullscreen, sem AppShell, somente leitura (docs/03 §4.9). */
export default function Apresentar() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { data: comparison = [] } = useQuarterComparison(teamId);
  const { data: levels = {} } = useTeamLevels(teamId ? [teamId] : []);
  const { data: kaizens = [] } = useKaizens(teamId);
  const { data: teams = [] } = useVisibleTeams();

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "Squad";
  const level = teamId ? levels[teamId] : undefined;

  const quarters = useMemo(() => [...new Set(comparison.map((r) => r.quarter))].sort(), [comparison]);
  const latestQuarter = quarters.at(-1);
  const latestRows = comparison.filter((r) => r.quarter === latestQuarter);
  const biggestDeltas = latestRows
    .map((r) => ({ ...r, delta: r.prev_stage != null && r.official_stage != null ? r.official_stage - r.prev_stage : 0 }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  const topKaizens = kaizens.filter((k) => k.status !== "done").slice(0, 3);

  const slides = [
    { key: "context", label: "Squad" },
    { key: "level", label: "Nível atual" },
    { key: "deltas", label: "Maiores deltas" },
    { key: "kaizens", label: "Próximos kaizens" },
    { key: "comparativo", label: "Comparativo Q×Q" },
  ];
  const [i, setI] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
      if (e.key === "Escape") navigate(`/s/${teamId}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, navigate, teamId]);

  const slide = slides[i].key;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6 text-foreground">
      <button
        onClick={() => navigate(`/s/${teamId}`)}
        className="absolute right-6 top-6 text-venice-textTertiary hover:text-foreground"
      >
        <X className="h-5 w-5" />
      </button>

      <main className="w-full max-w-2xl rounded-2xl border border-border bg-card p-11 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-venice-accentSoftFg">
          Modo apresentação · slide {i + 1} de {slides.length}
        </p>

        {slide === "context" && (
          <>
            <h1 className="mt-4 font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">
              {teamName} · {latestQuarter ?? "sem ciclo oficial"}
            </h1>
            <p className="mt-3 text-sm text-venice-textSecondary">Squad</p>
          </>
        )}

        {slide === "level" && (
          <>
            <h1 className="mt-4 font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">
              {level ? level.overall_stage.toFixed(1) : "—"}
            </h1>
            <p className="mt-3 text-sm text-venice-textSecondary">Nível médio · {level?.quarter ?? "sem ciclo oficial"}</p>
            {level?.migrated_scale && <p className="mt-1 text-xs text-venice-textTertiary">escala convertida</p>}
          </>
        )}

        {slide === "deltas" && (
          <>
            <h1 className="mt-4 font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">Maiores deltas</h1>
            <p className="mt-3 text-sm text-venice-textSecondary">Maiores movimentos do quarter</p>
            <div className="mt-6 space-y-2 text-left">
              {biggestDeltas.map((d) => (
                <div key={d.dim_key} className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3">
                  <span className="text-sm">{d.dim_name}</span>
                  <span
                    className={cn(
                      "font-serif text-2xl",
                      d.delta > 0 ? "text-venice-okFg" : d.delta < 0 ? "text-venice-errFg" : "text-venice-textTertiary"
                    )}
                  >
                    {d.delta > 0 ? "+" : ""}
                    {d.delta.toFixed(1)}
                  </span>
                </div>
              ))}
              {biggestDeltas.length === 0 && (
                <p className="text-center text-sm text-venice-textTertiary">Sem histórico suficiente ainda.</p>
              )}
            </div>
          </>
        )}

        {slide === "kaizens" && (
          <>
            <h1 className="mt-4 font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">Próximos kaizens</h1>
            <p className="mt-3 text-sm text-venice-textSecondary">O que vem a seguir no plano de evolução</p>
            <div className="mt-6 space-y-2 text-left">
              {topKaizens.map((k) => (
                <div key={k.id} className="rounded-xl border border-border bg-card px-5 py-3">
                  <b className="text-sm">{k.title}</b>
                  {k.from_stage != null && k.to_stage != null && (
                    <p className="text-xs text-venice-accentStrong">
                      {k.from_stage} → {k.to_stage}
                    </p>
                  )}
                </div>
              ))}
              {topKaizens.length === 0 && (
                <p className="text-center text-sm text-venice-textTertiary">Nenhum kaizen pendente.</p>
              )}
            </div>
          </>
        )}

        {slide === "comparativo" && (
          <>
            <h1 className="mt-4 font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">Comparativo Q×Q</h1>
            <p className="mt-3 text-sm text-venice-textSecondary">Estágio por dimensão · {latestQuarter ?? "sem ciclo oficial"}</p>
            <div className="mt-6 space-y-1.5 text-left">
              {latestRows.map((r) => (
                <div key={r.dim_key} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2">
                  <span className="text-sm">{r.dim_name}</span>
                  <span className="font-serif text-lg">{r.official_stage?.toFixed(1) ?? "não medido"}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="flex items-center justify-center gap-6">
        <button
          onClick={() => setI((v) => Math.max(v - 1, 0))}
          disabled={i === 0}
          className="rounded-full border border-border bg-transparent px-4 py-2 text-sm font-medium text-venice-textSecondary disabled:opacity-30"
        >
          ← Anterior
        </button>
        <div className="flex gap-1.5">
          {slides.map((s, idx) => (
            <span key={s.key} className={cn("h-1.5 w-1.5 rounded-full", idx === i ? "bg-venice-accent" : "bg-venice-surface3")} />
          ))}
        </div>
        <button
          onClick={() => setI((v) => Math.min(v + 1, slides.length - 1))}
          disabled={i === slides.length - 1}
          className="rounded-full bg-venice-accent px-4 py-2 text-sm font-medium text-[#0d3311] hover:brightness-105 disabled:opacity-40"
        >
          Próximo →
        </button>
      </footer>
    </div>
  );
}
