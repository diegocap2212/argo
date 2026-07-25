import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PreSessionAssessment {
  cycle_id: string;
  dimension_id: string;
  sm_stage: number;
  rationale: string;
}

/** Pré-avaliações do SM para o ciclo (1 por dimensão). */
export function usePreSessionAssessments(cycleId: string | undefined) {
  return useQuery({
    queryKey: ["pre-session", cycleId],
    enabled: Boolean(cycleId),
    staleTime: 5_000,
    queryFn: async (): Promise<PreSessionAssessment[]> => {
      const { data, error } = await supabase
        .from("pre_session_assessments")
        .select("cycle_id, dimension_id, sm_stage, rationale")
        .eq("cycle_id", cycleId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Upsert de uma pré-avaliação. A RLS só permite escrita enquanto o ciclo está em pre_session. */
export function useSavePreSessionAssessment(cycleId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { dimensionId: string; smStage: number; rationale: string }) => {
      const { error } = await supabase.from("pre_session_assessments").upsert(
        {
          cycle_id: cycleId,
          dimension_id: p.dimensionId,
          sm_stage: p.smStage,
          rationale: p.rationale,
          created_by: user!.id,
        },
        { onConflict: "cycle_id,dimension_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pre-session", cycleId] }),
  });
}
