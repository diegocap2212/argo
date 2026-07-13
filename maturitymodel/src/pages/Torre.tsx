import { Link } from "react-router-dom";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { useVisibleTeams, useLatestAdherence } from "@/hooks/useTorreData";
import { useTeamLevels } from "@/hooks/useTeamLevels";

const STAGE_NAMES: Record<number, string> = {
  1: "Formação e alinhamento",
  2: "Confronto e estruturação",
  3: "Normalização",
  4: "Performance e autonomia",
};

function stageName(overallStage?: number): string {
  if (overallStage == null) return "—";
  return STAGE_NAMES[Math.floor(overallStage)] ?? "—";
}

export default function Torre() {
  const { data: teams = [], isLoading } = useVisibleTeams();
  const teamIds = teams.map((t) => t.id);
  const { data: levels = {} } = useTeamLevels(teamIds);
  const { data: adherence = {} } = useLatestAdherence(teamIds);

  const scatterData = teams
    .map((t) => ({
      name: t.name,
      nivel: levels[t.id]?.overall_stage,
      aderencia: adherence[t.id],
    }))
    .filter((d) => d.nivel != null && d.aderencia != null);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">
          Torre LM · {teams.length} squad{teams.length !== 1 ? "s" : ""}
        </h2>
        <p className="mt-1 text-sm text-venice-textSecondary">Nível médio (10 dimensões) do último ciclo oficial.</p>
      </div>

      {isLoading && <p className="text-sm text-venice-textTertiary">Carregando…</p>}
      {!isLoading && teams.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-venice-textTertiary">
          Nenhum squad visível ainda.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => {
          const level = levels[t.id];
          return (
            <Link
              key={t.id}
              to={`/s/${t.id}`}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-venice-accent hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <b className="text-sm">{t.name}</b>
                {t.tower && <span className="text-xs text-venice-textTertiary">{t.tower}</span>}
              </div>
              <p className="mt-1 font-serif text-3xl">{level ? level.overall_stage.toFixed(1) : "—"}</p>
              <p className="text-xs text-venice-textSecondary">{stageName(level?.overall_stage)}</p>
              <p className="text-xs text-venice-textTertiary">
                {level?.quarter ?? "sem ciclo oficial"}
                {level?.migrated_scale && " · escala convertida"}
              </p>
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4].map((s) => (
                  <span
                    key={s}
                    className="h-1 flex-1 rounded-full"
                    style={{
                      background:
                        level && Math.floor(level.overall_stage) >= s ? "var(--accent)" : "var(--surface-3)",
                    }}
                  />
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {scatterData.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">
            Nível MMA × aderência ao planejado
          </h3>
          <div className="h-72 rounded-xl">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  type="number"
                  dataKey="nivel"
                  name="Nível MMA"
                  domain={[1, 4]}
                  tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
                />
                <YAxis
                  type="number"
                  dataKey="aderencia"
                  name="Aderência %"
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                        <b>{p.name}</b>
                        <div>Nível {p.nivel.toFixed(1)}</div>
                        <div>Aderência {p.aderencia.toFixed(0)}%</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill="var(--accent)">
                  {scatterData.map((d, i) => (
                    <Cell key={i} fill={d.nivel >= 3 && d.aderencia < 60 ? "var(--warn)" : "var(--accent)"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-venice-textTertiary">
            Squads em destaque: nível alto com aderência baixa (possível divergência entre a nota e a operação).
          </p>
        </section>
      )}
    </div>
  );
}
