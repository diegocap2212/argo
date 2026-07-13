import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { CycleStatus, Role } from "@/types/mma";

export interface MySquad {
  team_id: string;
  team_name: string;
  roles: Role[];
  cycle_id: string | null;
  cycle_status: CycleStatus | null;
  quarter: string | null;
  /** Há algo que este usuário precisa fazer agora neste squad (votar/facilitar/homologar). */
  pending: boolean;
}

function isPendingFor(roles: Role[], status: CycleStatus | null): boolean {
  if (!status) return false;
  const isAM = roles.includes("am");
  const isSM = roles.includes("sm");
  if (status === "session") return isSM || isAM; // o facilitador precisa conduzir a sessão
  if (status === "homologation") return isAM;
  return false;
}

/**
 * Squads do usuário logado + o ciclo do quarter corrente de cada um.
 * Usado pelo SquadSwitcher, pela sidebar (badge de pendências) e pela tela Início.
 * Retorna [] silenciosamente se o schema ainda não existir (pré-Fase 2).
 */
export function useMySquads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-squads", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<MySquad[]> => {
      const { data: memberships, error: memErr } = await supabase
        .from("squad_members")
        .select("team_id, role, teams(name)")
        .eq("user_id", user!.id);

      if (memErr) {
        devWarn("useMySquads: squad_members indisponível ainda?", memErr.message);
        return [];
      }
      if (!memberships?.length) return [];

      type MembershipRow = { team_id: string; role: Role; teams: { name: string } | null };
      const rolesByTeam = new Map<string, { name: string; roles: Role[] }>();
      for (const m of memberships as unknown as MembershipRow[]) {
        const entry = rolesByTeam.get(m.team_id) ?? { name: m.teams?.name ?? "Squad", roles: [] };
        entry.roles.push(m.role);
        rolesByTeam.set(m.team_id, entry);
      }
      const teamIds = [...rolesByTeam.keys()];

      const { data: cycles, error: cycErr } = await supabase
        .from("assessment_cycles")
        .select("id, team_id, status, quarter")
        .in("team_id", teamIds)
        .order("quarter", { ascending: false });

      if (cycErr) {
        devWarn("useMySquads: assessment_cycles indisponível ainda?", cycErr.message);
      }

      type CycleRow = { id: string; team_id: string; status: CycleStatus; quarter: string };
      const latestCycleByTeam = new Map<string, CycleRow>();
      for (const c of (cycles ?? []) as CycleRow[]) {
        if (!latestCycleByTeam.has(c.team_id)) latestCycleByTeam.set(c.team_id, c);
      }

      return teamIds.map((teamId) => {
        const { name, roles } = rolesByTeam.get(teamId)!;
        const cycle = latestCycleByTeam.get(teamId);
        const cycle_status = (cycle?.status as CycleStatus) ?? null;
        return {
          team_id: teamId,
          team_name: name,
          roles,
          cycle_id: cycle?.id ?? null,
          cycle_status,
          quarter: cycle?.quarter ?? null,
          pending: isPendingFor(roles, cycle_status),
        };
      });
    },
  });
}
