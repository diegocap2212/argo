import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types/mma";

/** Papéis do usuário atual num squad específico (squad_members é por-squad). */
export function useSquadRoles(teamId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["squad-roles", teamId, user?.id],
    enabled: Boolean(teamId && user?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("squad_members")
        .select("role")
        .eq("team_id", teamId!)
        .eq("user_id", user!.id);

      if (error) {
        devWarn("useSquadRoles: squad_members indisponível ainda?", error.message);
        return [];
      }
      return (data ?? []).map((r: { role: Role }) => r.role);
    },
  });
}

// Papéis funcionais antes do genérico "team" — usado quando alguém acumula
// mais de um papel no mesmo squad e precisamos escolher um só (ex.: role_at_vote).
const ROLE_PRIORITY: Role[] = ["po", "tl", "sm", "am", "team"];

function primaryRoleOf(roles: Role[]): Role | null {
  if (!roles.length) return null;
  return [...roles].sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b))[0];
}

/** Visão resolvida de acesso do usuário atual dentro de um squad. */
export function useSquadRole(teamId: string | undefined) {
  const { data: roles = [], isLoading, ...rest } = useSquadRoles(teamId);

  const isAM = roles.includes("am");
  const isSM = roles.includes("sm");
  const isPO = roles.includes("po");
  const isTL = roles.includes("tl");
  const isMember = roles.length > 0;
  // AM não vota (é quem homologa) — regra do modelo, docs/03 §4.3.
  const canVote = isMember && !isAM;
  // Papel "mais específico" para registrar em contextos que exigem um único
  // valor (ex.: votes.role_at_vote) — determinístico, não a ordem de retorno da query.
  const primaryRole = primaryRoleOf(roles);

  return { roles, isAM, isSM, isPO, isTL, isMember, canVote, primaryRole, isLoading, ...rest };
}
