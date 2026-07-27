import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import type { Verdict } from "@/types/mma";

export interface AnchorWithReading {
  id: string;
  dimension_id: string;
  name: string;
  metric_key: string;
  unit: string | null;
  comparator: string;
  value: number | null;
  verdict: Verdict;
  read_at: string | null;
}

export function useTeamAnchors(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-anchors", teamId],
    enabled: Boolean(teamId),
    staleTime: 30_000,
    queryFn: async (): Promise<AnchorWithReading[]> => {
      const { data: anchors, error: aErr } = await supabase
        .from("anchors")
        .select("id, dimension_id, name, metric_key, unit, comparator")
        .eq("active", true);
      if (aErr) {
        devWarn("useTeamAnchors:", aErr.message);
        return [];
      }

      const { data: readings } = await supabase
        .from("anchor_readings")
        .select("anchor_id, value, verdict, read_at")
        .eq("team_id", teamId!)
        .order("read_at", { ascending: false });

      const latestByAnchor = new Map<string, { value: number | null; verdict: Verdict; read_at: string }>();
      for (const r of readings ?? []) {
        if (!latestByAnchor.has(r.anchor_id)) {
          latestByAnchor.set(r.anchor_id, { value: r.value, verdict: (r.verdict as Verdict) ?? "na", read_at: r.read_at });
        }
      }

      return (anchors ?? []).map((a) => {
        const r = latestByAnchor.get(a.id);
        return {
          ...a,
          value: r?.value ?? null,
          verdict: r?.verdict ?? "na",
          read_at: r?.read_at ?? null,
        };
      });
    },
  });
}

export function useSyncAnchors(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // `sync-anchors-user` (não mais `sync-anchors`): o handler antigo não fazia
      // autorização nenhuma e, sem `team_id`, sincronizava TODOS os squads. O novo exige
      // `team_id` e valida SM do squad / AM / admin. Ver _shared/authz.ts.
      const { data, error } = await supabase.functions.invoke("sync-anchors-user", { body: { team_id: teamId } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-anchors", teamId] }),
  });
}
