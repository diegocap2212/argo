import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePortalRole } from "@/hooks/usePortalRole";
import type { CycleStatus, Role } from "@/types/mma";

export interface MySquad {
  team_id: string;
  team_name: string;
  /** Papéis do usuário NESTE squad. Vazio quando ele vê o squad por ser AM/admin global. */
  roles: Role[];
  /** É membro deste squad (vs. está vendo por poder global). Separa as seções da home. */
  isMine: boolean;
  cycle_id: string | null;
  cycle_status: CycleStatus | null;
  quarter: string | null;
  /** Este squad espera uma ação DESTE usuário agora. */
  pending: boolean;
}

/**
 * "Espera a MINHA ação" — não "está em andamento".
 *
 * A distinção é o ponto da tela: o AM não é cobrado pela pré-sessão nem pela sessão de
 * 20 squads (isso é do SM de cada um), e o SM não é cobrado pela homologação. Marcar
 * tudo para todos devolveria o problema original por outro caminho — uma lista cheia
 * onde não se acha o que importa.
 */
function isPendingFor(
  status: CycleStatus | null,
  ctx: { isSMHere: boolean; isAM: boolean },
): boolean {
  // Squad sem ciclo no quarter: o SM precisa abrir. É a "evolução que não aparece"
  // mais silenciosa de todas — nada acontecendo e nenhum aviso.
  if (!status) return ctx.isSMHere;
  if (status === "pre_session" || status === "session") return ctx.isSMHere;
  if (status === "homologation") return ctx.isAM;
  return false; // official/archived: nada pendente
}

/**
 * Squads visíveis ao usuário + o ciclo mais recente de cada um.
 * Consumido pelo SquadSwitcher, pela sidebar (badge de pendências) e pela home.
 *
 * ESCOPO POR PAPEL — era a causa nº 1 de "não vejo o que preciso homologar":
 *   · SM/member → só os squads de que é membro (`squad_members`).
 *   · AM/admin  → TODOS os squads. A RLS já permite desde a migration 20260726120000;
 *                 antes disso a query aqui era o gargalo, não a permissão.
 */
export function useMySquads() {
  const { user } = useAuth();
  const { isAM, isLoading: roleLoading } = usePortalRole();

  return useQuery({
    // `isAM` na chave: se o papel chegasse depois, a lista ficaria cacheada no escopo
    // estreito e o AM continuaria sem ver os outros squads.
    queryKey: ["my-squads", user?.id, isAM],
    enabled: Boolean(user?.id) && !roleLoading,
    staleTime: 30_000,
    queryFn: async (): Promise<MySquad[]> => {
      // Sempre buscamos os vínculos próprios: é o que distingue "meu squad" de
      // "squad que eu vejo porque sou AM", e alimenta o papel de SM por squad.
      const { data: memberships, error: memErr } = await supabase
        .from("squad_members")
        .select("team_id, role, teams(name)")
        .eq("user_id", user!.id);

      if (memErr) {
        devWarn("useMySquads: squad_members indisponível ainda?", memErr.message);
        if (!isAM) return [];
      }

      type MembershipRow = { team_id: string; role: Role; teams: { name: string } | null };
      const mine = new Map<string, { name: string; roles: Role[] }>();
      for (const m of (memberships ?? []) as unknown as MembershipRow[]) {
        const entry = mine.get(m.team_id) ?? { name: m.teams?.name ?? "Squad", roles: [] };
        entry.roles.push(m.role);
        mine.set(m.team_id, entry);
      }

      // Nomes de todos os squads quando o papel é global.
      const names = new Map<string, string>([...mine].map(([id, v]) => [id, v.name]));
      if (isAM) {
        const { data: teams, error: teamErr } = await supabase
          .from("teams")
          .select("id, name")
          .order("name");
        if (teamErr) devWarn("useMySquads: teams indisponível?", teamErr.message);
        for (const t of (teams ?? []) as { id: string; name: string }[]) {
          names.set(t.id, t.name);
        }
      }

      const teamIds = [...names.keys()];
      if (!teamIds.length) return [];

      const { data: cycles, error: cycErr } = await supabase
        .from("assessment_cycles")
        .select("id, team_id, status, quarter")
        .in("team_id", teamIds)
        .order("quarter", { ascending: false });

      if (cycErr) {
        devWarn("useMySquads: assessment_cycles indisponível ainda?", cycErr.message);
      }

      type CycleRow = { id: string; team_id: string; status: CycleStatus; quarter: string };
      const latestByTeam = new Map<string, CycleRow>();
      for (const c of (cycles ?? []) as CycleRow[]) {
        if (!latestByTeam.has(c.team_id)) latestByTeam.set(c.team_id, c);
      }

      return teamIds.map((teamId) => {
        const membership = mine.get(teamId);
        const roles = membership?.roles ?? [];
        const cycle = latestByTeam.get(teamId);
        const cycle_status = cycle?.status ?? null;
        return {
          team_id: teamId,
          team_name: names.get(teamId) ?? "Squad",
          roles,
          isMine: Boolean(membership),
          cycle_id: cycle?.id ?? null,
          cycle_status,
          quarter: cycle?.quarter ?? null,
          pending: isPendingFor(cycle_status, { isSMHere: roles.includes("sm"), isAM }),
        };
      });
    },
  });
}
