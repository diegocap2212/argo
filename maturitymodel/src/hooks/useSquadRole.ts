import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePortalRole } from "@/hooks/usePortalRole";
import type { Role } from "@/types/mma";

/** Papéis do usuário atual num squad específico (`squad_members`: 'sm' | 'member'). */
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

/**
 * Acesso resolvido do usuário atual DENTRO de um squad — a combinação dos dois níveis:
 *
 *   · `isSM`  vem do squad  (`squad_members`): o SM facilita o SEU squad.
 *   · `isAM`  vem do portal (`portal_roles`):  o AM homologa QUALQUER squad.
 *
 * Compor aqui, e não em cada tela, é o que fez as telas de squad passarem a funcionar
 * para o AM global sem mudar nenhuma delas: antes `isAM` era papel de squad, então quem
 * homologava só conseguia abrir a homologação dos squads em que era membro.
 *
 * Removidos por não terem mais consequência: `isPO`, `isTL`, `canVote` (o voto individual
 * morreu na sessão colaborativa) e `primaryRole` (existia para `votes.role_at_vote`).
 */
export function useSquadRole(teamId: string | undefined) {
  const { data: roles = [], isLoading: squadLoading, ...rest } = useSquadRoles(teamId);
  const { isAM, isAdmin, isLoading: portalLoading } = usePortalRole();

  const isSM = roles.includes("sm");

  return {
    roles,
    isSM,
    isAM,
    isAdmin,
    // O AM/admin abre as telas do squad sem ser membro — é o trabalho dele.
    isMember: roles.length > 0 || isAM,
    // Um só isLoading: separado, a tela renderizava "sem permissão" antes de o papel
    // do portal chegar, e o usuário via um erro que não existia.
    isLoading: squadLoading || portalLoading,
    ...rest,
  };
}
