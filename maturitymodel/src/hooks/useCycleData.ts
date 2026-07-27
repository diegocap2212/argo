import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AxisKey, CycleStatus } from "@/types/mma";
import { keepValidStageNumbers } from "@/lib/domain";

export interface DimensionWithAxis {
  id: string;
  axis_id: string;
  key: string;
  name: string;
  description: string;
  narrative: string | null;
  owner_roles: string[];
  display_order: number;
  axis_key: AxisKey;
  axis_name: string;
}

/** As 10 dimensões + eixo — conteúdo estático do modelo, cache longo. */
export function useDimensions() {
  return useQuery({
    queryKey: ["dimensions"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DimensionWithAxis[]> => {
      const { data, error } = await supabase
        .from("dimensions")
        .select("id, axis_id, key, name, description, narrative, owner_roles, display_order, axes(key, name)")
        .order("display_order");
      if (error) throw error;
      type Row = Omit<DimensionWithAxis, "axis_key" | "axis_name"> & {
        axes: { key: AxisKey; name: string } | null;
      };
      return ((data ?? []) as unknown as Row[]).map((d) => ({
        ...d,
        axis_key: d.axes?.key as AxisKey,
        axis_name: d.axes?.name ?? "",
      }));
    },
  });
}

export interface StageDescription {
  id: string;
  dimension_id: string;
  stage_number: 1 | 2 | 3 | 4;
  description: string;
  short_text: string;
  example: string | null;
  kaizen_hint: string | null;
  anchor_note: string | null;
}

/** As 40 descrições (10 dimensões × 4 estágios) — conteúdo estático. */
export function useStageDescriptions() {
  return useQuery({
    queryKey: ["dimension_stage_descriptions"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<StageDescription[]> => {
      const { data, error } = await supabase.from("dimension_stage_descriptions").select("*");
      if (error) throw error;
      // `stage_number` é `int` no banco. CHECK em 20260727140000 garante 1..4; aqui é a
      // segunda linha (descarta com aviso em vez de mentir com `as StageDescription[]`).
      return keepValidStageNumbers(data ?? [], "useStageDescriptions");
    },
  });
}

export interface Cycle {
  id: string;
  team_id: string;
  quarter: string;
  status: CycleStatus;
  workshop_at: string | null;
  officialized_at: string | null;
  homologated_by: string | null;
  previous_cycle_id: string | null;
  migrated_scale: boolean;
}

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}Q${q}`;
}

/** Ciclo mais recente do squad (qualquer status). `pollMs` liga refetch periódico
 *  (usado pelo modo participante da Sessão pra acompanhar o SM em tempo quase-real). */
export function useLatestCycle(teamId: string | undefined, pollMs?: number) {
  return useQuery({
    queryKey: ["cycle", teamId],
    enabled: Boolean(teamId),
    staleTime: pollMs ? 0 : 15_000,
    refetchInterval: pollMs ?? false,
    queryFn: async (): Promise<Cycle | null> => {
      const { data, error } = await supabase
        .from("assessment_cycles")
        .select("*")
        .eq("team_id", teamId!)
        .order("quarter", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Cycle | null;
    },
  });
}

/** Cria o ciclo do quarter corrente para o squad (SM ou AM). Começa em 'session'. */
export function useStartCycle(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("assessment_cycles")
        .insert({
          team_id: teamId,
          quarter: currentQuarter(),
          status: "pre_session",
          workshop_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as Cycle;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycle", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}

/** Transiciona o status do ciclo (valida contra CYCLE_TRANSITIONS antes de chamar). */
export function useTransitionCycle(teamId: string, cycleId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: CycleStatus) => {
      if (!cycleId) throw new Error("Ciclo inexistente");
      const { error } = await supabase.from("assessment_cycles").update({ status }).eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycle", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}

export interface ProposalRow {
  cycle_id: string;
  dimension_id: string;
  stage: number;
  decided_by: string;
  divergence: boolean;
  notes: string | null;
}

/** Notas de consenso por dimensão. `pollMs` liga refetch (modo participante). */
export function useProposals(cycleId: string | undefined, pollMs?: number) {
  return useQuery({
    queryKey: ["proposals", cycleId],
    enabled: Boolean(cycleId),
    staleTime: pollMs ? 0 : 5_000,
    refetchInterval: pollMs ?? false,
    queryFn: async (): Promise<ProposalRow[]> => {
      const { data, error } = await supabase.from("proposals").select("*").eq("cycle_id", cycleId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveProposal(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      dimensionId: string;
      stage: number;
      decidedBy: "consensus" | "sm_final";
      divergence: boolean;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("proposals").upsert(
        {
          cycle_id: cycleId,
          dimension_id: p.dimensionId,
          stage: p.stage,
          decided_by: p.decidedBy,
          divergence: p.divergence,
          notes: p.notes ?? null,
        },
        { onConflict: "cycle_id,dimension_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals", cycleId] }),
  });
}

export interface HomologationRow {
  cycle_id: string;
  dimension_id: string;
  official_stage: number;
  adjusted: boolean;
  justification: string | null;
  am_user_id: string;
}

export function useHomologations(cycleId: string | undefined) {
  return useQuery({
    queryKey: ["homologations", cycleId],
    enabled: Boolean(cycleId),
    staleTime: 5_000,
    queryFn: async (): Promise<HomologationRow[]> => {
      const { data, error } = await supabase.from("homologations").select("*").eq("cycle_id", cycleId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveHomologation(cycleId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (h: { dimensionId: string; officialStage: number; adjusted: boolean; justification?: string | null }) => {
      const { error } = await supabase.from("homologations").upsert(
        {
          cycle_id: cycleId,
          dimension_id: h.dimensionId,
          official_stage: h.officialStage,
          adjusted: h.adjusted,
          justification: h.justification ?? null,
          am_user_id: user!.id,
        },
        { onConflict: "cycle_id,dimension_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologations", cycleId] }),
  });
}

/** RPC transacional: valida 10/10 homologações, oficializa e gera kaizens do plano. */
export function useOfficializeCycle(teamId: string, cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("officialize_cycle", { p_cycle: cycleId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycle", teamId] });
      qc.invalidateQueries({ queryKey: ["homologations", cycleId] });
      qc.invalidateQueries({ queryKey: ["kaizens", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}

export interface KaizenRow {
  id: string;
  team_id: string;
  cycle_id: string | null;
  dimension_id: string | null;
  title: string;
  from_stage: number | null;
  to_stage: number | null;
  owner_id: string | null;
  status: "backlog" | "doing" | "done" | "dropped";
  anchor_id: string | null;
  baseline_value: number | null;
  target_value: number | null;
  result_value: number | null;
  due_date: string | null;
  source: "model" | "custom";
}

export function useKaizens(teamId: string | undefined) {
  return useQuery({
    queryKey: ["kaizens", teamId],
    enabled: Boolean(teamId),
    staleTime: 10_000,
    queryFn: async (): Promise<KaizenRow[]> => {
      const { data, error } = await supabase
        .from("kaizens")
        .select("*")
        .eq("team_id", teamId!)
        .neq("status", "dropped")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KaizenRow[];
    },
  });
}

export function useMoveKaizen(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resultValue }: { id: string; status: KaizenRow["status"]; resultValue?: number | null }) => {
      // Tipado com os campos REAIS da tabela, não `Record<string, unknown>`: o cliente do
      // Supabase rejeita índice aberto (`RejectExcessProperties`), e com razão — um typo em
      // nome de coluna passava a ser erro de compilação em vez de update silenciosamente
      // ignorado. Só apareceu quando o typecheck do app passou a compilar `src`.
      const patch: { status: KaizenRow["status"]; result_value?: number } = { status };
      if (status === "done" && resultValue != null) patch.result_value = resultValue;
      const { error } = await supabase.from("kaizens").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kaizens", teamId] }),
  });
}

export function useCreateKaizen(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from("kaizens").insert({ team_id: teamId, title, source: "custom", status: "backlog" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kaizens", teamId] }),
  });
}
