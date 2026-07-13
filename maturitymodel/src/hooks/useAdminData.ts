import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/types/mma";

export interface AdminTeam {
  id: string;
  name: string;
  tower: string | null;
  locavia_team_key: string | null;
  status: string | null;
}

export function useAdminTeams() {
  return useQuery({
    queryKey: ["admin-teams"],
    staleTime: 15_000,
    queryFn: async (): Promise<AdminTeam[]> => {
      const { data, error } = await supabase.from("teams").select("id, name, tower, locavia_team_key, status").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; tower: string }) => {
      const { error } = await supabase.from("teams").insert({ name: input.name, tower: input.tower, status: "active" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-teams"] }),
  });
}

export interface AdminCycle {
  id: string;
  team_id: string;
  quarter: string;
  status: "session" | "homologation" | "official" | "archived";
  workshop_at: string | null;
}

export function useAdminTeamCycle(teamId: string | undefined) {
  return useQuery({
    queryKey: ["admin-cycle", teamId],
    enabled: Boolean(teamId),
    queryFn: async (): Promise<AdminCycle | null> => {
      const { data, error } = await supabase
        .from("assessment_cycles")
        .select("id, team_id, quarter, status, workshop_at")
        .eq("team_id", teamId!)
        .order("quarter", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AdminCycle | null;
    },
  });
}

export function useRestartAssessment(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const restartRpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: { p_team: string }
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await restartRpc("restart_assessment", { p_team: teamId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cycle", teamId] });
      qc.invalidateQueries({ queryKey: ["cycle", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}

export function useDeleteSquad(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const deleteRpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: { p_team: string }
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await deleteRpc("delete_squad", { p_team: teamId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
      qc.invalidateQueries({ queryKey: ["visible-teams"] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
  });
}

export interface AdminMember {
  team_id: string;
  user_id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
}

export interface AdminProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  is_am: boolean;
}

/** Diretório de pessoas que já acessaram o portal; AMs aparecem destacados. */
export function useAdminProfiles() {
  return useQuery({
    queryKey: ["admin-profiles"],
    staleTime: 30_000,
    queryFn: async (): Promise<AdminProfile[]> => {
      const [{ data: profiles, error: profileError }, { data: amMemberships, error: memberError }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name").order("email"),
        supabase.from("squad_members").select("user_id").eq("role", "am"),
      ]);
      if (profileError) throw profileError;
      if (memberError) throw memberError;

      const amIds = new Set((amMemberships ?? []).map((membership) => membership.user_id));
      return (profiles ?? [])
        .map((profile) => ({ ...profile, is_am: amIds.has(profile.id) }))
        .sort((a, b) => Number(b.is_am) - Number(a.is_am) || (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
    },
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ["admin-members", teamId],
    enabled: Boolean(teamId),
    staleTime: 10_000,
    queryFn: async (): Promise<AdminMember[]> => {
      const { data, error } = await supabase
        .from("squad_members")
        .select("team_id, user_id, role, profiles(email, full_name)")
        .eq("team_id", teamId!);
      if (error) throw error;
      type Row = {
        team_id: string;
        user_id: string;
        role: Role;
        profiles: { email: string | null; full_name: string | null } | null;
      };
      return ((data ?? []) as unknown as Row[]).map((m) => ({
        team_id: m.team_id,
        user_id: m.user_id,
        role: m.role,
        email: m.profiles?.email ?? null,
        full_name: m.profiles?.full_name ?? null,
      }));
    },
  });
}

/** Adiciona diretamente por user_id — usado para sessões anônimas (sem email pra buscar). */
export function useAddMemberById(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await supabase.from("squad_members").insert({ team_id: teamId, user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members", teamId] });
      qc.invalidateQueries({ queryKey: ["squad-roles", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}

export function useAddMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Role }) => {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) throw new Error("Nenhum usuário com esse email já fez login no portal ainda.");
      const { error } = await supabase.from("squad_members").insert({ team_id: teamId, user_id: profile.id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members", teamId] });
      qc.invalidateQueries({ queryKey: ["squad-roles", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}

export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await supabase
        .from("squad_members")
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members", teamId] });
      qc.invalidateQueries({ queryKey: ["squad-roles", teamId] });
      qc.invalidateQueries({ queryKey: ["my-squads"] });
    },
  });
}
