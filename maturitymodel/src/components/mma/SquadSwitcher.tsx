import { ChevronDown } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMySquads } from "@/hooks/useMySquads";
import { cn } from "@/lib/utils";
import type { CycleStatus } from "@/types/mma";

const STATUS_LABEL: Record<CycleStatus, string> = {
  voting: "Votação aberta",
  workshop: "Workshop",
  proposed: "Aguardando homologação",
  homologation: "Homologação",
  official: "Ciclo oficial",
  archived: "Arquivado",
};

const STATUS_DOT: Record<CycleStatus, string> = {
  voting: "bg-venice-warn",
  workshop: "bg-venice-warn",
  proposed: "bg-venice-warn",
  homologation: "bg-venice-err",
  official: "bg-venice-ok",
  archived: "bg-venice-textTertiary",
};

export function SquadSwitcher() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { data: squads = [] } = useMySquads();

  const active = squads.find((s) => s.team_id === teamId);

  if (!squads.length) {
    return <span className="text-sm text-venice-textTertiary">Nenhum squad vinculado</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
          {active?.cycle_status && (
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[active.cycle_status])} />
          )}
          <span className="font-serif text-base">{active?.team_name ?? "Selecionar squad"}</span>
          {active?.quarter && <span className="text-venice-textTertiary">· {active.quarter}</span>}
          <ChevronDown className="h-3.5 w-3.5 text-venice-textTertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Seus squads</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {squads.map((s) => (
          <DropdownMenuItem
            key={s.team_id}
            className="flex items-center justify-between gap-2"
            onSelect={() => navigate(`/s/${s.team_id}`)}
          >
            <span className="flex items-center gap-1.5">
              {s.team_name}
              {s.pending && <span className="h-1.5 w-1.5 rounded-full bg-venice-err" />}
            </span>
            {s.cycle_status && (
              <span className="flex items-center gap-1.5 text-xs text-venice-textTertiary">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s.cycle_status])} />
                {STATUS_LABEL[s.cycle_status]}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
