import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AxisKey } from "@/types/mma";

export interface AxisRow {
  id: string;
  key: AxisKey;
  name: string;
  owner_role: string;
  display_order: number;
}

export interface StageRow {
  number: 1 | 2 | 3 | 4;
  name: string;
  legacy_name: string;
  tuckman: string;
  description: string;
}

export function useAxes() {
  return useQuery({
    queryKey: ["axes"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<AxisRow[]> => {
      const { data, error } = await supabase.from("axes").select("*").order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStages() {
  return useQuery({
    queryKey: ["stages"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<StageRow[]> => {
      const { data, error } = await supabase.from("stages").select("*").order("number");
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
  });
}
