import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useQuarterComparison } from "@/hooks/useQuarterComparison";
import { cn } from "@/lib/utils";

function seriesColor(idx: number, total: number) {
  // Q×Q dataviz: quarter atual = accent; anterior = apoio-violet (charter §2); mais antigos = neutro.
  if (idx === total - 1) return "var(--accent)";
  if (idx === total - 2) return "var(--apoio-violet)";
  return "var(--border-strong)";
}

export default function Comparativo() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: rows = [], isLoading } = useQuarterComparison(teamId);

  const quarters = useMemo(() => [...new Set(rows.map((r) => r.quarter))].sort(), [rows]);
  const [selected, setSelected] = useState<string[]>([]);
  const activeQuarters = (selected.length ? selected : quarters.slice(-3)).slice(-3);

  const dimensions = useMemo(() => [...new Set(rows.map((r) => r.dim_name))], [rows]);

  const radarData = dimensions.map((dimName) => {
    const point: Record<string, string | number> = { dimension: dimName };
    for (const q of activeQuarters) {
      const row = rows.find((r) => r.dim_name === dimName && r.quarter === q);
      point[q] = row?.official_stage ?? 0;
    }
    return point;
  });

  const latestQuarter = quarters.at(-1);
  const prevQuarter = quarters.length > 1 ? quarters[quarters.length - 2] : undefined;
  const deltaRows = dimensions
    .map((dimName) => {
      const row = rows.find((r) => r.dim_name === dimName && r.quarter === latestQuarter);
      return row ? { ...row } : null;
    })
    .filter(Boolean) as (typeof rows)[number][];

  const historyByDim = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const dimName of dimensions) {
      const vals = quarters
        .map((q) => rows.find((r) => r.dim_name === dimName && r.quarter === q)?.official_stage)
        .filter((v): v is number => v != null);
      map.set(dimName, vals.slice(-3));
    }
    return map;
  }, [dimensions, quarters, rows]);

  if (isLoading) return <p className="text-sm text-venice-textTertiary">Carregando…</p>;

  if (!quarters.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-venice-textTertiary">
        Ainda não há histórico de ciclos oficiais para comparar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">Comparativo por quarter</h2>
          <p className="mt-1 text-sm text-venice-textTertiary">Evolução do estágio por dimensão entre os últimos ciclos oficiais</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quarters.map((q) => (
            <button
              key={q}
              onClick={() =>
                setSelected((cur) => (cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q].slice(-3)))
              }
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold",
                activeQuarters.includes(q)
                  ? "border-venice-accent bg-venice-okBg text-venice-okFg"
                  : "border-border bg-card text-venice-textSecondary"
              )}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-[15px] font-semibold">Radar por dimensão</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {activeQuarters.map((q, i) => (
              <span key={q} className="flex items-center gap-1.5 text-[11px] font-medium text-venice-textSecondary">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: seriesColor(i, activeQuarters.length) }}
                />
                {q}
              </span>
            ))}
          </div>
          <div className="mt-3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border-subtle)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <PolarRadiusAxis domain={[0, 4]} tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} />
                {activeQuarters.map((q, i) => (
                  <Radar
                    key={q}
                    name={q}
                    dataKey={q}
                    stroke={seriesColor(i, activeQuarters.length)}
                    fill={seriesColor(i, activeQuarters.length)}
                    fillOpacity={i === activeQuarters.length - 1 ? 0.25 : 0.08}
                    strokeWidth={i === activeQuarters.length - 1 ? 2 : 1}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-[15px] font-semibold">
            Delta {prevQuarter ?? "—"}→{latestQuarter ?? "—"} · por dimensão
          </h3>
          <div className="mt-3 space-y-1.5">
            {deltaRows.map((r) => {
              const delta = r.prev_stage != null && r.official_stage != null ? r.official_stage - r.prev_stage : null;
              const trendClass =
                delta == null
                  ? "text-venice-textTertiary"
                  : delta > 0
                  ? "text-venice-okFg"
                  : delta < 0
                  ? "text-venice-errFg"
                  : "text-venice-textTertiary";
              const arrow = delta == null ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "=";
              const history = historyByDim.get(r.dim_name) ?? [];
              return (
                <div key={r.dim_key} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
                  <span className="min-w-0 flex-1 text-sm">{r.dim_name}</span>
                  <div className="flex h-6 items-end gap-0.5" aria-hidden="true">
                    {history.map((v, idx) => (
                      <span
                        key={idx}
                        className="w-1.5 rounded-sm"
                        style={{
                          height: `${Math.max(15, (v / 4) * 100)}%`,
                          backgroundColor: idx === history.length - 1 ? "var(--accent)" : "var(--border-strong)",
                        }}
                      />
                    ))}
                  </div>
                  {r.migrated_scale && <span className="text-[10px] text-venice-textTertiary">escala convertida</span>}
                  <span className={cn("font-mono text-xs font-medium tabular-nums", trendClass)}>
                    {r.prev_stage != null ? r.prev_stage.toFixed(1) : "?"} →{" "}
                    {r.official_stage != null ? r.official_stage.toFixed(1) : "não medido"} {arrow}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
