import { useState } from "react";
import {
  useAddMember,
  useAddMemberById,
  useAdminProfiles,
  useAdminTeamCycle,
  useAdminTeams,
  useCreateTeam,
  useDeleteSquad,
  useGrantPortalRole,
  usePortalRoleGrants,
  useRemoveMember,
  useRestartAssessment,
  useRevokePortalRole,
  useTeamMembers,
} from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/utils";
import { RotateCcw, Trash2, X } from "lucide-react";
import type { PortalRole, Role } from "@/types/mma";

/**
 * Administração — SÓ admin global (a rota é gated por RequireAdmin).
 *
 * A tela tem dois níveis, que antes viviam misturados num único seletor de papel:
 *   · Papéis do PORTAL  (`portal_roles`): admin e AM, globais, por e-mail.
 *   · Membros do SQUAD  (`squad_members`): sm e member.
 *
 * Misturar os dois era o que fazia "conceder AM" parecer uma ação local de squad —
 * e é a origem de "não aparece pra mim que preciso homologar".
 */

const SQUAD_ROLES: Role[] = ["sm", "member"];
const SQUAD_ROLE_LABEL: Record<Role, string> = {
  sm: "SM — facilita este squad",
  member: "Member — participa e acompanha",
};
const PORTAL_ROLE_LABEL: Record<PortalRole, string> = {
  admin: "Admin geral — faz tudo",
  am: "AM — vê todos os squads e homologa",
};

export default function AdminMMA() {
  const { data: teams = [], isLoading } = useAdminTeams();
  const createTeam = useCreateTeam();
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamTower, setNewTeamTower] = useState("LM");

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const { data: members = [] } = useTeamMembers(selectedTeam ?? undefined);
  const { data: profiles = [], isLoading: profilesLoading } = useAdminProfiles();
  const addMember = useAddMember(selectedTeam ?? "");
  const addMemberById = useAddMemberById(selectedTeam ?? "");
  const removeMember = useRemoveMember(selectedTeam ?? "");
  const { data: cycle } = useAdminTeamCycle(selectedTeam ?? undefined);
  const restartAssessment = useRestartAssessment(selectedTeam ?? "");
  const deleteSquad = useDeleteSquad(selectedTeam ?? "");
  const selectedTeamName = teams.find((team) => team.id === selectedTeam)?.name ?? "";
  const [memberEmail, setMemberEmail] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [memberRole, setMemberRole] = useState<Role>("member");

  const { data: grants = [] } = usePortalRoleGrants();
  const grantRole = useGrantPortalRole();
  const revokeRole = useRevokePortalRole();
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRoleValue, setGrantRoleValue] = useState<PortalRole>("am");

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">Administração</h2>
        <p className="mt-1 text-sm text-venice-textSecondary">
          Squads, membros e papéis do portal — visão de admin.
        </p>
      </div>

      {/* ─── Papéis globais ─────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">
          Papéis do portal
        </h3>
        <p className="mb-3 text-xs text-venice-textTertiary">
          Valem em <b>todos</b> os squads. O AM vê todos os times e homologa, mas não reinicia
          assessment, não exclui squad e não gerencia membros. Pode ser concedido antes do primeiro
          login da pessoa — a chave é o e-mail corporativo.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={grantRoleValue} onValueChange={(v) => setGrantRoleValue(v as PortalRole)}>
            <SelectTrigger className="min-w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PORTAL_ROLE_LABEL) as PortalRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {PORTAL_ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="E-mail corporativo"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            className="max-w-xs"
          />
          <Button
            size="sm"
            disabled={!grantEmail.trim() || grantRole.isPending}
            onClick={async () => {
              try {
                await grantRole.mutateAsync({ email: grantEmail, role: grantRoleValue });
                setGrantEmail("");
                toast({ title: "Papel concedido" });
              } catch (e) {
                toast({ title: "Não foi possível conceder", description: errMessage(e), variant: "destructive" });
              }
            }}
          >
            Conceder
          </Button>
        </div>

        <div className="space-y-1.5">
          {grants.map((g) => (
            <div
              key={`${g.email}-${g.role}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 text-sm">{g.email}</span>
              {g.note && <span className="text-xs text-venice-textTertiary">{g.note}</span>}
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium uppercase">
                {g.role}
              </span>
              <button
                aria-label={`Revogar ${g.role} de ${g.email}`}
                onClick={async () => {
                  // Revogar o próprio admin fecha a porta atrás de si — a RLS negaria a
                  // próxima escrita e a única saída seria uma migration.
                  if (
                    g.role === "admin" &&
                    !window.confirm(
                      `Revogar o papel de admin de ${g.email}? Se for a sua própria conta, você perde o acesso a esta tela.`,
                    )
                  ) {
                    return;
                  }
                  try {
                    await revokeRole.mutateAsync({ email: g.email, role: g.role });
                    toast({ title: "Papel revogado" });
                  } catch (e) {
                    toast({ title: "Não foi possível revogar", description: errMessage(e), variant: "destructive" });
                  }
                }}
                className="text-venice-textTertiary hover:text-venice-err"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {grants.length === 0 && (
            <p className="text-sm text-venice-textTertiary">Nenhum papel global concedido.</p>
          )}
        </div>
      </section>

      {/* ─── Squads ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">
          Squads
        </h3>
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Nome do squad"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Torre"
            value={newTeamTower}
            onChange={(e) => setNewTeamTower(e.target.value)}
            className="max-w-[120px]"
          />
          <Button
            size="sm"
            disabled={!newTeamName.trim() || createTeam.isPending}
            onClick={async () => {
              await createTeam.mutateAsync({ name: newTeamName.trim(), tower: newTeamTower.trim() });
              setNewTeamName("");
              toast({ title: "Squad criado" });
            }}
          >
            + Squad
          </Button>
        </div>

        {isLoading && <p className="text-sm text-venice-textTertiary">Carregando…</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTeam(t.id)}
              className={`rounded-xl border p-3.5 text-left shadow-sm ${
                selectedTeam === t.id ? "border-venice-accent bg-venice-accentSoft" : "border-border bg-card"
              }`}
            >
              <b className="text-sm">{t.name}</b>
              <p className="text-xs text-venice-textTertiary">
                {t.tower} · {t.status}
              </p>
            </button>
          ))}
        </div>
      </section>

      {selectedTeam && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold">Assessment atual</h3>
              <p className="mt-1 text-xs text-venice-textTertiary">
                {cycle ? `${cycle.quarter} · ${cycle.status}` : "Nenhum assessment iniciado para este squad."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!cycle || restartAssessment.isPending}
              onClick={async () => {
                // `prompt` em vez de `confirm`: o motivo é OBRIGATÓRIO no banco desde
                // 2026-07-27, e é ele que dá sentido à trilha em `destructive_audit`. Confirmar
                // sem justificar registraria "alguém apagou tudo" e nada mais — que é
                // exatamente a auditoria inútil que o review apontou.
                const motivo = window.prompt(
                  `Reiniciar o assessment ${cycle?.quarter}? A análise prévia, as notas da sessão, as homologações, o resultado oficial e os kaizens deste ciclo serão APAGADOS.\n\n` +
                    `Esta ação fica registrada com o seu e-mail e um snapshot do que existia.\n\n` +
                    `Descreva o motivo:`,
                );
                // `null` = cancelou no diálogo; string vazia = confirmou sem justificar.
                if (motivo === null) return;
                try {
                  await restartAssessment.mutateAsync(motivo);
                  toast({
                    title: "Assessment reiniciado",
                    description: "O ciclo voltou vazio para a pré-sessão.",
                  });
                } catch (e) {
                  toast({ title: "Não foi possível reiniciar", description: errMessage(e), variant: "destructive" });
                }
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {restartAssessment.isPending ? "Reiniciando…" : "Reiniciar assessment"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-venice-err/30 bg-venice-errBg p-4">
            <div>
              <h3 className="text-sm font-semibold text-venice-errFg">Excluir squad permanentemente</h3>
              <p className="mt-1 text-xs text-venice-errFg">
                Remove membros, assessments, métricas e planos vinculados. Esta ação não pode ser desfeita.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteSquad.isPending}
              onClick={async () => {
                const typedName = window.prompt(
                  `Para excluir, digite exatamente o nome do squad: ${selectedTeamName}`,
                );
                if (typedName !== selectedTeamName) {
                  if (typedName !== null)
                    toast({ title: "Nome incorreto", description: "O squad não foi excluído.", variant: "destructive" });
                  return;
                }
                try {
                  await deleteSquad.mutateAsync();
                  setSelectedTeam(null);
                  toast({ title: "Squad excluído", description: `${selectedTeamName} e seus dados foram removidos.` });
                } catch (e) {
                  toast({ title: "Não foi possível excluir", description: errMessage(e), variant: "destructive" });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteSquad.isPending ? "Excluindo…" : "Excluir squad"}
            </Button>
          </div>

          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">
              Membros · {selectedTeamName}
            </h3>
            <p className="mb-3 text-xs text-venice-textTertiary">
              Papel <b>dentro deste squad</b>. Para dar poder de homologar, use “Papéis do portal” acima.
            </p>

            <div className="mb-3 flex flex-wrap gap-2">
              <Select value={memberRole} onValueChange={(v) => setMemberRole(v as Role)}>
                <SelectTrigger className="min-w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SQUAD_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {SQUAD_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="min-w-[280px] flex-1">
                  <SelectValue
                    placeholder={profilesLoading ? "Carregando pessoas…" : "Selecionar pessoa cadastrada"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.portalRoles.length ? `${profile.portalRoles.join("/").toUpperCase()} · ` : ""}
                      {profile.full_name || profile.email || profile.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selectedProfile || addMemberById.isPending}
                onClick={async () => {
                  try {
                    await addMemberById.mutateAsync({ userId: selectedProfile, role: memberRole });
                    setSelectedProfile("");
                    toast({ title: "Membro adicionado" });
                  } catch (e) {
                    toast({ title: "Erro", description: errMessage(e), variant: "destructive" });
                  }
                }}
              >
                Adicionar pessoa
              </Button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <Input
                placeholder="Ou informe um e-mail exato"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                className="max-w-xs"
              />
              <Button
                size="sm"
                disabled={!memberEmail.trim() || addMember.isPending}
                onClick={async () => {
                  try {
                    await addMember.mutateAsync({ email: memberEmail, role: memberRole });
                    setMemberEmail("");
                    toast({ title: "Membro adicionado" });
                  } catch (e) {
                    toast({ title: "Erro", description: errMessage(e), variant: "destructive" });
                  }
                }}
              >
                + Membro
              </Button>
            </div>

            <p className="mb-3 text-xs text-venice-textTertiary">
              A lista mostra quem já acessou o portal. O prefixo indica papel global (ADMIN/AM).
            </p>

            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={`${m.user_id}-${m.role}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-sm">{m.full_name || m.email || m.user_id}</span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium">{m.role}</span>
                  <button
                    aria-label={`Remover ${m.full_name || m.email} do squad`}
                    onClick={() => removeMember.mutate({ userId: m.user_id, role: m.role })}
                    className="text-venice-textTertiary hover:text-venice-err"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {members.length === 0 && <p className="text-sm text-venice-textTertiary">Nenhum membro ainda.</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
