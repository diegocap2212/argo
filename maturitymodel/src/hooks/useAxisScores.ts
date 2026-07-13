import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import type { AxisKey } from "@/types/mma";

export interface AxisScore {
  axis_key: AxisKey;
  axis_score: number;
  quarter: string;
}

/** Notas por eixo (Processo/Produto/Time) do último ciclo oficial do squad — v_axis_scores. */
export function useAxisScores(teamId: string | undefined) {
  return useQuery({
    queryKey: ["axis-scores", teamId],
    enabled: Boolean(teamId),
    staleTime: 60_000,
    queryFn: async (): Promise<AxisScore[]> => {
      const { data, error } = await supabase
        .from("v_axis_scores")
        .select("axis_key, axis_score, quarter")
        .eq("team_id", teamId!)
        .order("quarter", { ascending: false });

      if (error) {
        devWarn("useAxisScores: v_axis_scores indisponível ainda?", error.message);
        return [];
      }

      const latestQuarter = data?.[0]?.quarter;
      return (data ?? []).filter((row: AxisScore) => row.quarter === latestQuarter);
    },
  });
}
