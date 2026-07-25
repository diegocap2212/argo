import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { CycleStatus } from "@/types/mma";

interface Station {
  key: string;
  label: string;
  path: string;
  statuses: CycleStatus[];
}

const STATIONS: Station[] = [
  { key: "pre-sessao", label: "Pré-sessão", path: "sessao", statuses: ["pre_session"] },
  { key: "sessao", label: "Sessão", path: "sessao", statuses: ["session"] },
  { key: "homologacao", label: "Homologação", path: "homologacao", statuses: ["homologation"] },
  { key: "plano", label: "Plano", path: "plano", statuses: ["official", "archived"] },
];

const ORDER: CycleStatus[] = ["pre_session", "session", "homologation", "official", "archived"];

export function CycleJourney({ teamId, status }: { teamId: string; status: CycleStatus }) {
  const currentIndex = ORDER.indexOf(status);

  return (
    <div className="flex items-start">
      {STATIONS.map((station, i) => {
        const stationMaxIndex = Math.max(...station.statuses.map((s) => ORDER.indexOf(s)));
        const isDone = currentIndex > stationMaxIndex;
        const isNow = station.statuses.includes(status);
        const dotClass = isDone
          ? "border border-venice-ok bg-venice-okBg text-venice-okFg"
          : isNow
            ? "bg-venice-accent text-[#0d3311] shadow-[0_0_0_4px_var(--ok-bg)]"
            : "border border-border bg-venice-surface3 text-venice-textTertiary";

        return (
          <div key={station.key} className="flex flex-1 items-start">
            <Link to={`/s/${teamId}/${station.path}`} className="flex-1 text-center">
              <div className={cn("mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all", dotClass)}>
                {isDone ? "✓" : i + 1}
              </div>
              <p className="text-xs font-semibold">{station.label}</p>
            </Link>
            {i < STATIONS.length - 1 && (
              <div className={cn("mt-4 h-0.5 flex-1 min-w-[24px]", isDone ? "bg-venice-ok" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
