import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CycleStatus, PortalRole, Role } from "@/types/mma";

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
  // Reusa CycleStatus em vez de repetir a união: esta lista estava sem 'pre_session'
  // desde 24/07, então a tela de admin exibia um status que o TypeScript dizia impossível.
  status: CycleStatus;
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

/**
 * Reinicia o assessment do squad. `reason` é OBRIGATÓRIO.
 *
 * A ação apaga kaizens, homologações, propostas e pré-sessão. Desde 2026-07-27 o banco exige
 * o motivo e grava snapshot do que existia em `destructive_audit` — antes não havia registro
 * de quem reiniciou, por quê, nem o que havia antes. A autorização (admin-only) já estava
 * certa; o que faltava era governança e recuperação.
 */
export function useRestartAssessment(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const motivo = reason?.trim() ?? "";
      // Barra aqui também, não só no banco: a mensagem do Postgres é boa para log, ruim para
      // uma pessoa lendo um toast.
      if (!motivo) {
        throw new Error("Informe o motivo do reinício — a ação é destrutiva e fica auditada.");
      }
      const restartRpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: { p_team: string; p_reason: string }
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await restartRpc("restart_assessment", { p_team: teamId, p_reason: motivo });
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
  /** Papéis GLOBAIS desta pessoa (portal_roles), casados por e-mail. */
  portalRoles: PortalRole[];
}

/**
 * Diretório de pessoas que já acessaram o portal, com o papel global de cada uma.
 * Só o admin enxerga o diretório completo (RLS de profiles).
 *
 * O destaque de AM passou a vir de `portal_roles` e não de `squad_members.role='am'`:
 * o papel deixou de ser por squad, então a antiga marcação ("já é AM em outro squad")
 * perdeu sentido — e era ela que fazia parecer que AM era coisa local.
 */
export function useAdminProfiles(enabled = true) {
  return useQuery({
    queryKey: ["admin-profiles"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminProfile[]> => {
      const [{ data: profiles, error: profileError }, { data: roles, error: rolesError }] =
        await Promise.all([
          supabase.from("profiles").select("id, email, full_name").order("email"),
          supabase.from("portal_roles").select("email, role"),
        ]);
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;

      const byEmail = new Map<string, PortalRole[]>();
      for (const r of (roles ?? []) as { email: string; role: PortalRole }[]) {
        byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r.role]);
      }

      const weight = (p: PortalRole[]) => (p.includes("admin") ? 2 : p.includes("am") ? 1 : 0);
      return (profiles ?? [])
        .map((profile) => ({
          ...profile,
          portalRoles: byEmail.get((profile.email ?? "").toLowerCase()) ?? [],
        }))
        .sort(
          (a, b) =>
            weight(b.portalRoles) - weight(a.portalRoles) ||
            (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""),
        );
    },
  });
}

export interface PortalRoleRow {
  email: string;
  role: PortalRole;
  note: string | null;
}

/** Todas as concessões de papel global. Admin-only pela RLS de portal_roles. */
export function usePortalRoleGrants() {
  return useQuery({
    queryKey: ["portal-role-grants"],
    staleTime: 15_000,
    queryFn: async (): Promise<PortalRoleRow[]> => {
      const { data, error } = await supabase
        .from("portal_roles")
        .select("email, role, note")
        .order("role")
        .order("email");
      if (error) throw error;
      return (data ?? []) as PortalRoleRow[];
    },
  });
}

function invalidatePortalRoles(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["portal-role-grants"] });
  qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  // O papel decide o ESCOPO da home e das telas de squad — sem isto quem acabou de
  // receber AM continuaria vendo só os próprios squads até um reload.
  qc.invalidateQueries({ queryKey: ["portal-roles"] });
  qc.invalidateQueries({ queryKey: ["my-squads"] });
}

export function useGrantPortalRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role, note }: { email: string; role: PortalRole; note?: string }) => {
      // lower() é CHECK na tabela: gravar com maiúscula falharia no banco, e o e-mail do
      // JWT também é comparado em minúsculas.
      const { error } = await supabase
        .from("portal_roles")
        .insert({ email: email.trim().toLowerCase(), role, note: note?.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => invalidatePortalRoles(qc),
  });
}

export function useRevokePortalRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: PortalRole }) => {
      const { error } = await supabase
        .from("portal_roles")
        .delete()
        .eq("email", email.toLowerCase())
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => invalidatePortalRoles(qc),
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
      // O diretório de profiles é fechado por RLS — a busca por e-mail exato passa pela
      // RPC find_profile_by_email (permitida a gestores SM/AM e ao admin do portal).
      const { data: found, error: pErr } = await supabase.rpc("find_profile_by_email", {
        p_email: email.trim().toLowerCase(),
      });
      if (pErr) throw pErr;
      const profile = found?.[0];
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
