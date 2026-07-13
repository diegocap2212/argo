import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";

const LOCAVIA_TEAM_BY_NAME: Record<string, string> = {
  gol: "GOL",
  optimus: "OPTIMUS",
  nivus: "NIVUS",
  jetta: "JETTA",
  scania: "SCANIA",
  parati: "PARATI",
  "sf cloud": "SFMKT",
  "sf vendas": "SFV",
};

export interface TeamDashboardTarget {
  name: string;
  locaviaTeamId: string | null;
}

/** Resolve a rota de performance do Locavia para o squad atual. */
export function useTeamDashboardTarget(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-dashboard-target", teamId],
    enabled: Boolean(teamId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TeamDashboardTarget | null> => {
      const { data, error } = await supabase
        .from("teams")
        .select("name, locavia_team_key")
        .eq("id", teamId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        name: data.name,
        locaviaTeamId: data.locavia_team_key || LOCAVIA_TEAM_BY_NAME[data.name.trim().toLowerCase()] || null,
      };
    },
  });
}

export interface TorreTeam {
  id: string;
  name: string;
  tower: string | null;
  status: string | null;
}

/** Squads visíveis ao usuário atual (RLS decide: membro vê os seus, AM vê todos). */
export function useVisibleTeams() {
  return useQuery({
    queryKey: ["visible-teams"],
    staleTime: 30_000,
    queryFn: async (): Promise<TorreTeam[]> => {
      const { data, error } = await supabase.from("teams").select("id, name, tower, status").order("name");
      if (error) {
        devWarn("useVisibleTeams:", error.message);
        return [];
      }
      return data ?? [];
    },
  });
}

export interface AdherencePoint {
  team_id: string;
  adherence_pct: number;
}

/** Última leitura de flow.adherence_pct por squad — usada no scatter nível×aderência. */
export function useLatestAdherence(teamIds: string[]) {
  return useQuery({
    queryKey: ["adherence", teamIds.slice().sort().join(",")],
    enabled: teamIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data: anchor, error: anchorErr } = await supabase
        .from("anchors")
        .select("id")
        .eq("metric_key", "flow.adherence_pct")
        .limit(1)
        .maybeSingle();
      if (anchorErr || !anchor) return {};

      const { data, error } = await supabase
        .from("anchor_readings")
        .select("team_id, value, read_at")
        .eq("anchor_id", anchor.id)
        .in("team_id", teamIds)
        .order("read_at", { ascending: false });
      if (error) return {};

      const result: Record<string, number> = {};
      for (const row of data ?? []) {
        if (!(row.team_id in result) && row.value != null) result[row.team_id] = row.value;
      }
      return result;
    },
  });
}
