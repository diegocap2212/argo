import { useState } from "react";
import { useAdminTeams, useCreateTeam, useTeamMembers, useAddMember, useAddMemberById, useRemoveMember, useAdminTeamCycle, useRestartAssessment, useAdminProfiles, useDeleteSquad } from "@/hooks/useAdminData";
import { useAuth } from "@/hooks/useAuth";
import { useIsPortalAdmin } from "@/hooks/useIsPortalAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/utils";
import { RotateCcw, Trash2, X } from "lucide-react";
import type { Role } from "@/types/mma";

const ROLES: Role[] = ["team", "po", "tl", "sm", "am"];

export default function AdminMMA() {
  const { user, isAnonymous } = useAuth();
  // Dois modos: admin global (tudo) × gestor SM/AM (só os squads dele — a RLS já
  // escopa a lista de teams; aqui escondemos as ações que a RLS negaria).
  const { data: isPortalAdmin = false } = useIsPortalAdmin();
  const { data: teams = [], isLoading } = useAdminTeams();
  const createTeam = useCreateTeam();
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamTower, setNewTeamTower] = useState("LM");

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const { data: members = [] } = useTeamMembers(selectedTeam ?? undefined);
  const { data: profiles = [], isLoading: profilesLoading } = useAdminProfiles(isPortalAdmin);
  const addMember = useAddMember(selectedTeam ?? "");
  const addMemberById = useAddMemberById(selectedTeam ?? "");
  const removeMember = useRemoveMember(selectedTeam ?? "");
  const { data: cycle } = useAdminTeamCycle(selectedTeam ?? undefined);
  const restartAssessment = useRestartAssessment(selectedTeam ?? "");
  const deleteSquad = useDeleteSquad(selectedTeam ?? "");
  const selectedTeamName = teams.find((team) => team.id === selectedTeam)?.name ?? "";
  const [memberEmail, setMemberEmail] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [memberRole, setMemberRole] = useState<Role>("team");

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">Administração</h2>
        <p className="mt-1 text-sm text-venice-textSecondary">
          {isPortalAdmin ? "Squads, membros e papéis do MMA — visão de admin do portal." : "Membros e papéis dos squads sob sua gestão."}
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">Squads</h3>
        {isPortalAdmin && (
          <div className="mb-4 flex gap-2">
            <Input placeholder="Nome do squad" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="max-w-xs" />
            <Input placeholder="Torre" value={newTeamTower} onChange={(e) => setNewTeamTower(e.target.value)} className="max-w-[120px]" />
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
        )}

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
            {isPortalAdmin && <Button
              variant="outline"
              size="sm"
              disabled={!cycle || restartAssessment.isPending}
              onClick={async () => {
                const confirmed = window.confirm(
                  `Reiniciar o assessment ${cycle?.quarter}? Todas as respostas, propostas, homologações, resultados oficiais e kaizens deste ciclo serão apagados.`
                );
                if (!confirmed) return;
                try {
                  await restartAssessment.mutateAsync();
                  toast({ title: "Assessment reiniciado", description: "O ciclo voltou vazio para a etapa de sessão." });
                } catch (e) {
                  toast({ title: "Não foi possível reiniciar", description: errMessage(e), variant: "destructive" });
                }
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {restartAssessment.isPending ? "Reiniciando…" : "Reiniciar assessment"}
            </Button>}
          </div>

          {isPortalAdmin && <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-venice-err/30 bg-venice-errBg p-4">
            <div>
              <h3 className="text-sm font-semibold text-venice-errFg">Excluir squad permanentemente</h3>
              <p className="mt-1 text-xs text-venice-errFg">Remove membros, assessments, métricas e planos vinculados. Esta ação não pode ser desfeita.</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteSquad.isPending}
              onClick={async () => {
                const typedName = window.prompt(`Para excluir, digite exatamente o nome do squad: ${selectedTeamName}`);
                if (typedName !== selectedTeamName) {
                  if (typedName !== null) toast({ title: "Nome incorreto", description: "O squad não foi excluído.", variant: "destructive" });
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
          </div>}

          <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-venice-textTertiary">
            Membros · {teams.find((t) => t.id === selectedTeam)?.name}
          </h3>

          {/* Diretório completo: só o admin do portal (a RLS fecha profiles para os demais). */}
          {isPortalAdmin && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="min-w-[280px] flex-1">
                  <SelectValue placeholder={profilesLoading ? "Carregando pessoas…" : "Selecionar pessoa cadastrada"} />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.is_am ? "AM · " : ""}{profile.full_name || profile.email || profile.id}
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
          )}

          <div className="mb-4 flex flex-wrap gap-2 border-t border-border pt-3">
            <Select value={memberRole} onValueChange={(v) => setMemberRole(v as Role)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder={isPortalAdmin ? "Ou informe um e-mail exato" : "E-mail exato de quem já logou no portal"}
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
            {isAnonymous && (
              <Button
                size="sm"
                variant="outline"
                disabled={addMemberById.isPending}
                onClick={async () => {
                  await addMemberById.mutateAsync({ userId: user!.id, role: memberRole });
                  toast({ title: "Você foi adicionado a este squad" });
                }}
              >
                Adicionar a mim mesmo
              </Button>
            )}
          </div>

          <p className="mb-3 text-xs text-venice-textTertiary">
            {isAnonymous
              ? "Sua sessão é anônima (login ainda não definido) — use \"Adicionar a mim mesmo\" para testar como este papel, ou busque por email quem já tiver logado com conta real."
              : isPortalAdmin
              ? "A lista mostra quem já acessou o portal. Pessoas marcadas com AM já exercem esse papel em outro squad."
              : "Adicione membros pelo e-mail corporativo exato — a pessoa precisa ter feito o primeiro login no portal."}
          </p>

          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={`${m.user_id}-${m.role}`} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                <span className="min-w-0 flex-1 text-sm">{m.full_name || m.email || m.user_id}</span>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium">{m.role}</span>
                <button
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
