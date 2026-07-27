import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AxisKey } from "@/types/mma";
import { keepValidAxisKeys } from "@/lib/domain";
import { classifyQueryError } from "@/lib/query-error";

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
        // Classifica em vez de engolir: recurso ausente/permissão devolvem vazio (com log
        // que SOBREVIVE em produção); qualquer outra falha é lançada para a tela poder dizer
        // "não consegui carregar" em vez de "nada aqui". Ver lib/query-error.ts.
        classifyQueryError("useQuarterComparison", error);
        return [];
      }
      // Ver useAxisScores: CHECK no banco + descarte com aviso na fronteira.
      return keepValidAxisKeys(data ?? [], "useQuarterComparison");
    },
  });
}
