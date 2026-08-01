/**
 * A superfície de dados do app de administração: os tipos das linhas que ele lê e escreve, e
 * os hooks de leitura.
 *
 * ⚠️ NADA AQUI AUTORIZA. Todo `select`/`insert`/`update` passa pela RLS com o JWT da pessoa —
 * quem decide é `has_perm()` no banco. O que este arquivo faz é decidir o que a TELA mostra, e
 * a regra do repo vale: nunca renderizar formulário que a RLS vai recusar no envio.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// ── Linhas ────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  label: string;
  description: string;
  scope: 'global' | 'squad';
  rank: number;
  grantable: boolean;
}

export interface Permission {
  id: string;
  app: 'neo' | 'mma' | 'dash' | 'nero';
  group_label: string;
  label: string;
  description: string;
  scope: 'global' | 'squad';
  rank: number;
}

export interface MatrixPair {
  role_id: string;
  permission_id: string;
}

export interface PortalRoleRow {
  email: string;
  role: string;
  note: string | null;
  created_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  user_id: string | null;
}

export interface OrphanGrant {
  email: string;
  role: string;
  created_at: string;
  granted_by: string | null;
}

export interface NeoAccessRow {
  email: string;
  approved: boolean;
  note: string | null;
  created_at: string;
}

export interface MatrixAuditRow {
  id: string;
  at: string;
  actor_email: string | null;
  role_id: string;
  permission_id: string;
  action: 'grant' | 'revoke';
}

export interface DestructiveAuditRow {
  id: string;
  action: string;
  team_id: string | null;
  actor_email: string | null;
  reason: string | null;
  created_at: string;
}

export interface TeamRow {
  id: string;
  name: string;
  tower: string | null;
}

export interface SquadMemberRow {
  user_id: string;
  team_id: string;
  role: string;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

// ── Leitura ───────────────────────────────────────────────────────────────

/**
 * Erro de leitura LANÇA (ao contrário de `usePermissions`, que é fail-closed silencioso).
 *
 * Aqui é o certo: uma tela de administração que mostra lista vazia por falha de rede faz a
 * pessoa acreditar que não há ninguém com aquele papel — e agir sobre isso. Melhor a tela dizer
 * que não conseguiu ler.
 */
async function rows<T>(table: string, select: string, order?: string): Promise<T[]> {
  let q = supabase.from(table).select(select);
  if (order) q = q.order(order);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as T[];
}

export function useRoles() {
  return useQuery({
    queryKey: ['neo_roles'],
    staleTime: 5 * 60_000,
    queryFn: () => rows<Role>('neo_roles', '*', 'rank'),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ['neo_permissions'],
    staleTime: 5 * 60_000,
    queryFn: () => rows<Permission>('neo_permissions', '*', 'rank'),
  });
}

export function useMatrix() {
  return useQuery({
    queryKey: ['neo_role_permissions'],
    queryFn: () => rows<MatrixPair>('neo_role_permissions', 'role_id, permission_id'),
  });
}

export function usePortalRoles() {
  return useQuery({
    queryKey: ['portal_roles'],
    queryFn: () => rows<PortalRoleRow>('portal_roles', '*', 'email'),
  });
}

export function useOrphanGrants() {
  return useQuery({
    queryKey: ['v_portal_roles_orfaos'],
    queryFn: () => rows<OrphanGrant>('v_portal_roles_orfaos', '*'),
  });
}

export function useNeoAccess() {
  return useQuery({
    queryKey: ['neo_access'],
    queryFn: () => rows<NeoAccessRow>('neo_access', '*', 'email'),
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => rows<TeamRow>('teams', 'id, name, tower', 'name'),
  });
}

export function useSquadMembers() {
  return useQuery({
    queryKey: ['squad_members'],
    queryFn: () => rows<SquadMemberRow>('squad_members', 'user_id, team_id, role'),
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => rows<ProfileRow>('profiles', 'id, email, full_name', 'full_name'),
  });
}

export function useMatrixAudit() {
  return useQuery({
    queryKey: ['neo_role_permissions_audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('neo_role_permissions_audit')
        .select('*')
        .order('at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MatrixAuditRow[];
    },
  });
}

export function useDestructiveAudit() {
  return useQuery({
    queryKey: ['destructive_audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('destructive_audit')
        .select('id, action, team_id, actor_email, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DestructiveAuditRow[];
    },
  });
}

// ── Utilidades de apresentação ────────────────────────────────────────────

/** Agrupa o catálogo por app e por grupo, na ordem do `rank` — é o layout da matriz. */
export function groupPermissions(perms: Permission[]): Array<{ group: string; app: string; items: Permission[] }> {
  const out: Array<{ group: string; app: string; items: Permission[] }> = [];
  for (const p of [...perms].sort((a, b) => a.rank - b.rank)) {
    const last = out[out.length - 1];
    if (last && last.group === p.group_label && last.app === p.app) last.items.push(p);
    else out.push({ group: p.group_label, app: p.app, items: [p] });
  }
  return out;
}

export const APP_LABEL: Record<Permission['app'], string> = {
  neo: 'NEO',
  mma: 'Maturity Model',
  dash: 'Performance Dash',
  nero: 'Nero',
};

/**
 * Uma PESSOA, vista pela administração: a união de quem tem conta (`profiles`) com quem só tem
 * papel concedido por e-mail (`portal_roles`).
 *
 * Os dois conjuntos não coincidem, e a diferença é operacional, não teórica:
 *   · conta sem papel   → participa de squads, não tem autoridade global;
 *   · papel sem conta   → recebeu acesso e NUNCA ENTROU. Quase sempre é e-mail digitado errado.
 *
 * `userId === null` é o caso que a tela precisa tratar em vez de esconder: **squad exige
 * conta**, porque `squad_members` é chaveado por `user_id`.
 */
export interface Person {
  email: string;
  userId: string | null;
  nome: string | null;
  /** O nome nunca foi definido — o trigger de signup copiou o e-mail. Ver a ficha. */
  nomeEhEmail: boolean;
  /** Papéis globais ATIVOS. Revogados não entram. */
  papeis: string[];
  squads: Array<{ teamId: string; role: string }>;
  temGrantRevogado: boolean;
}

export function buildPeople(
  profiles: ProfileRow[],
  grants: PortalRoleRow[],
  members: SquadMemberRow[],
): Person[] {
  const porEmail = new Map<string, Person>();

  const garantir = (email: string): Person => {
    const chave = email.toLowerCase();
    let p = porEmail.get(chave);
    if (!p) {
      p = { email: chave, userId: null, nome: null, nomeEhEmail: false, papeis: [], squads: [], temGrantRevogado: false };
      porEmail.set(chave, p);
    }
    return p;
  };

  for (const perfil of profiles) {
    if (!perfil.email) continue;
    const p = garantir(perfil.email);
    p.userId = perfil.id;
    p.nome = perfil.full_name;
    // O `handle_new_user` grava `coalesce(raw_user_meta_data->>'full_name', email)` e o login
    // por OTP não manda nome — então "nome == e-mail" significa "ninguém definiu ainda".
    p.nomeEhEmail = !!perfil.full_name && perfil.full_name.toLowerCase() === perfil.email.toLowerCase();
  }

  for (const g of grants) {
    const p = garantir(g.email);
    if (g.revoked_at) p.temGrantRevogado = true;
    else p.papeis.push(g.role);
  }

  const squadsPorUser = new Map<string, Array<{ teamId: string; role: string }>>();
  for (const m of members) {
    const lista = squadsPorUser.get(m.user_id) ?? [];
    lista.push({ teamId: m.team_id, role: m.role });
    squadsPorUser.set(m.user_id, lista);
  }
  for (const p of porEmail.values()) {
    if (p.userId) p.squads = squadsPorUser.get(p.userId) ?? [];
  }

  return [...porEmail.values()].sort((a, b) =>
    (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR'),
  );
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
