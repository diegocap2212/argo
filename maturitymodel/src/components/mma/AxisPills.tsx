import { useAxisScores } from "@/hooks/useAxisScores";
import { cn } from "@/lib/utils";
import type { AxisKey } from "@/types/mma";

const AXIS_LABEL: Record<AxisKey, string> = {
  processo: "Processo",
  produto: "Produto",
  time: "Time",
};

const AXIS_CLASS: Record<AxisKey, string> = {
  processo: "bg-venice-infoBg text-venice-info",
  produto: "bg-venice-warnBg text-venice-warnFg",
  time: "bg-venice-okBg text-venice-okFg",
};

export function AxisPills({ teamId }: { teamId: string }) {
  const { data: scores = [] } = useAxisScores(teamId);

  if (!scores.length) return null;

  return (
    <div className="flex items-center gap-2">
      {scores.map((s) => (
        <span
          key={s.axis_key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            AXIS_CLASS[s.axis_key]
          )}
        >
          {AXIS_LABEL[s.axis_key]} {s.axis_score.toFixed(1)}
        </span>
      ))}
    </div>
  );
}
