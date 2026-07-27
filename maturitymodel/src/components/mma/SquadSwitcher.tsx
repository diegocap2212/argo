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

// Estes dois mapas estavam presos no modelo ANTERIOR à sessão colaborativa: cobriam
// 'voting'/'workshop'/'proposed' (mortos) e não tinham 'pre_session' nem 'session' — os
// dois estados em que os ciclos realmente ficam hoje. Resultado: o switcher renderizava
// `undefined` como classe do ponto e como rótulo. `Record<CycleStatus, …>` já acusava,
// mas o script `typecheck` não checava nada (tsconfig com `files: []` e sem `--build`).
const STATUS_LABEL: Record<CycleStatus, string> = {
  pre_session: "Pré-sessão",
  session: "Sessão aberta",
  homologation: "Aguardando homologação",
  official: "Ciclo oficial",
  archived: "Arquivado",
};

const STATUS_DOT: Record<CycleStatus, string> = {
  pre_session: "bg-venice-warn",
  session: "bg-venice-warn",
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
