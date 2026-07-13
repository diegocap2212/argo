import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";

export interface TeamLevel {
  team_id: string;
  quarter: string;
  overall_stage: number;
  migrated_scale: boolean;
  dim_count: number;
}

/**
 * Nível médio (10 dimensões) do último ciclo oficial de cada squad — v_cycle_scores.
 * Usado por Início ("Seus squads") e Torre (grid). teamIds vazio = todos visíveis (RLS decide).
 */
export function useTeamLevels(teamIds?: string[]) {
  return useQuery({
    queryKey: ["team-levels", teamIds?.slice().sort().join(",") ?? "all"],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, TeamLevel>> => {
      let query = supabase
        .from("v_cycle_scores")
        .select("team_id, quarter, official_stage, migrated_scale")
        .order("quarter", { ascending: false });
      if (teamIds?.length) query = query.in("team_id", teamIds);

      const { data, error } = await query;
      if (error) {
        devWarn("useTeamLevels: v_cycle_scores indisponível ainda?", error.message);
        return {};
      }

      const latestQuarterByTeam = new Map<string, string>();
      for (const row of data ?? []) {
        if (!latestQuarterByTeam.has(row.team_id)) latestQuarterByTeam.set(row.team_id, row.quarter);
      }

      const acc = new Map<string, { sum: number; count: number; quarter: string; migrated: boolean }>();
      for (const row of data ?? []) {
        if (row.quarter !== latestQuarterByTeam.get(row.team_id)) continue;
        const entry = acc.get(row.team_id) ?? { sum: 0, count: 0, quarter: row.quarter, migrated: row.migrated_scale };
        entry.sum += row.official_stage ?? 0;
        entry.count += 1;
        acc.set(row.team_id, entry);
      }

      const result: Record<string, TeamLevel> = {};
      for (const [teamId, entry] of acc) {
        result[teamId] = {
          team_id: teamId,
          quarter: entry.quarter,
          overall_stage: entry.sum / entry.count,
          migrated_scale: entry.migrated,
          dim_count: entry.count,
        };
      }
      return result;
    },
  });
}
