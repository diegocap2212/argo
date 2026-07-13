import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import type { AxisKey } from "@/types/mma";

export interface ComparisonRow {
  team_id: string;
  quarter: string;
  dim_key: string;
  dim_name: string;
  axis_key: AxisKey;
  official_stage: number | null;
  prev_stage: number | null;
  migrated_scale: boolean;
}

export function useQuarterComparison(teamId: string | undefined) {
  return useQuery({
    queryKey: ["quarter-comparison", teamId],
    enabled: Boolean(teamId),
    staleTime: 60_000,
    queryFn: async (): Promise<ComparisonRow[]> => {
      const { data, error } = await supabase
        .from("v_quarter_comparison")
        .select("*")
        .eq("team_id", teamId!)
        .order("quarter", { ascending: true });
      if (error) {
        devWarn("useQuarterComparison:", error.message);
        return [];
      }
      return data ?? [];
    },
  });
}
