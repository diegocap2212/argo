import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { keepValidAxisKeys } from "@/lib/domain";
import { classifyQueryError } from "@/lib/query-error";
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
        // Classifica em vez de engolir: recurso ausente/permissão devolvem vazio (com log
        // que SOBREVIVE em produção); qualquer outra falha é lançada para a tela poder dizer
        // "não consegui carregar" em vez de "nada aqui". Ver lib/query-error.ts.
        classifyQueryError("useAxisScores", error);
        return [];
      }

      const latestQuarter = data?.[0]?.quarter;
      // `axis_key` vem do banco como `text`. O CHECK da migration 20260727140000 garante o
      // domínio; aqui é a segunda linha, para dado fora dele ser DESCARTADO com aviso em vez
      // de atravessar o app tipado como se fosse válido (era o que um `as AxisKey` faria).
      return keepValidAxisKeys(data ?? [], "useAxisScores")
        .filter((row) => row.quarter === latestQuarter);
    },
  });
}
