/**
 * SQUADS E MEMBROS — migra o que era `AdminMMA.tsx` dentro do Maturity.
 *
 * POR QUE SAIU DE LÁ: administrar a organização não é usar o modelo de maturidade. Enquanto a
 * tela vivia dentro do MMA, "quem administra o MMA" e "quem administra o NEO" eram a mesma
 * pessoa por acidente de layout. Aqui as duas coisas ficam em superfícies diferentes, cada uma
 * com a sua permissão.
 *
 * AS DUAS AÇÕES DESTRUTIVAS VIERAM JUNTO, e isso não era opcional: `AdminMMA.tsx` era o ÚNICO
 * lugar do portal com "reiniciar assessment" e "excluir squad". Movê-lo sem trazê-las teria
 * removido funcionalidade em silêncio — o tipo de perda que só aparece quando alguém precisa.
 *
 * As duas passam por RPC `security definer` que grava em `destructive_audit` (quem, quando,
 * motivo, snapshot). O motivo do reinício é OBRIGATÓRIO no banco desde `20260727180000`: a
 * assinatura de 1 argumento foi removida justamente para não haver caminho sem auditoria.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfiles, useSquadMembers, useTeams } from '@/lib/rbac';
import { Badge, Button, Card, ConfirmDialog, Input, PageTitle, QueryState, Select, Table, Td, Th } from '@/ui';

export function Squads() {
  const { can, isLoading: permsLoading } = usePermissions();
  const teams = useTeams();
  const members = useSquadMembers();
  const profiles = useProfiles();
  const qc = useQueryClient();

  const podeCriar = can('mma.squad.create');
  const podeGerirMembros = can('mma.member.manage');
  const podeReiniciar = can('mma.cycle.restart');
  const podeExcluir = can('mma.squad.delete');

  const [novoSquad, setNovoSquad] = useState('');
  const [novaTorre, setNovaTorre] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string>('');
  const [novoMembro, setNovoMembro] = useState('');
  const [papelMembro, setPapelMembro] = useState('member');
  const [reiniciando, setReiniciando] = useState<{ id: string; name: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [excluindo, setExcluindo] = useState<{ id: string; name: string } | null>(null);
  const [confirmacaoNome, setConfirmacaoNome] = useState('');

  const perfilPorId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles.data ?? []) map.set(p.id, p.full_name || p.email || p.id);
    return map;
  }, [profiles.data]);

  const membrosDoSquad = useMemo(
    () => (members.data ?? []).filter((m) => m.team_id === selecionado),
    [members.data, selecionado],
  );

  const invalidar = async () => {
    await qc.invalidateQueries({ queryKey: ['teams'] });
    await qc.invalidateQueries({ queryKey: ['squad_members'] });
  };

  const criarSquad = useMutation({
    mutationFn: async () => {
      const nome = novoSquad.trim();
      if (!nome) throw new Error('Informe o nome do squad.');
      const { error } = await supabase.from('teams').insert({ name: nome, tower: novaTorre.trim() || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setNovoSquad('');
      setNovaTorre('');
      setErro(null);
      await invalidar();
    },
    onError: (e: unknown) => setErro(explain(e)),
  });

  const adicionarMembro = useMutation({
    mutationFn: async () => {
      if (!selecionado) throw new Error('Escolha um squad.');
      if (!novoMembro) throw new Error('Escolha a pessoa.');
      // A PK de `squad_members` é (team_id, user_id, ROLE) — três colunas, então a MESMA pessoa
      // pode existir duas vezes no mesmo squad, uma como sm e outra como member. Um `upsert`
      // com `onConflict: 'team_id,user_id'` nem chega a rodar (não há índice com essas duas
      // colunas, o Postgres devolve 42P10); e um upsert pela tripla criaria a linha duplicada
      // em vez de TROCAR o papel. Apagar antes é o que dá a semântica de "um papel por pessoa
      // por squad", que é a única que faz sentido desde que os papéis viraram só sm/member.
      const { error: limpeza } = await supabase
        .from('squad_members')
        .delete()
        .eq('team_id', selecionado)
        .eq('user_id', novoMembro);
      if (limpeza) throw new Error(limpeza.message);
      const { error } = await supabase
        .from('squad_members')
        .insert({ team_id: selecionado, user_id: novoMembro, role: papelMembro });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setNovoMembro('');
      setErro(null);
      await invalidar();
    },
    onError: (e: unknown) => setErro(explain(e)),
  });

  const removerMembro = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('squad_members')
        .delete()
        .eq('team_id', selecionado)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
    onError: (e: unknown) => setErro(explain(e)),
  });

  /**
   * Reiniciar o assessment: apaga o ciclo corrente do squad e recomeça. O `p_reason` é
   * OBRIGATÓRIO — a assinatura de 1 argumento foi removida do banco de propósito, para não
   * existir caminho sem trilha.
   */
  const reiniciar = useMutation({
    mutationFn: async () => {
      if (!reiniciando) return;
      if (motivo.trim().length < 5) throw new Error('Descreva o motivo — ele fica na trilha de auditoria.');
      const { error } = await supabase.rpc('restart_assessment', {
        p_team: reiniciando.id,
        p_reason: motivo.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setReiniciando(null);
      setMotivo('');
      setErro(null);
      await qc.invalidateQueries({ queryKey: ['destructive_audit'] });
    },
    onError: (e: unknown) => {
      setReiniciando(null);
      setErro(explain(e));
    },
  });

  /**
   * Excluir squad. Irreversível na prática — o `destructive_audit` guarda um snapshot para
   * reconstrução manual, não um backup. Por isso a confirmação pede o NOME digitado: um
   * "Confirmar" sozinho é clicável por reflexo.
   */
  const excluir = useMutation({
    mutationFn: async () => {
      if (!excluindo) return;
      if (confirmacaoNome.trim() !== excluindo.name) {
        throw new Error('O nome digitado não confere com o do squad.');
      }
      const { error } = await supabase.rpc('delete_squad', { p_team: excluindo.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setExcluindo(null);
      setConfirmacaoNome('');
      setSelecionado('');
      setErro(null);
      await invalidar();
      await qc.invalidateQueries({ queryKey: ['destructive_audit'] });
    },
    onError: (e: unknown) => {
      setExcluindo(null);
      setErro(explain(e));
    },
  });

  return (
    <div>
      <PageTitle
        title="Squads e membros"
        subtitle="A estrutura da organização: quais squads existem e quem participa de cada um, como SM ou como member."
      />

      {erro ? (
        <Card className="mb-4 border-error">
          <p className="text-sm text-error">{erro}</p>
        </Card>
      ) : null}

      {podeCriar ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg text-ink">Criar squad</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder="Nome do squad"
              value={novoSquad}
              onChange={(e) => setNovoSquad(e.target.value)}
            />
            <Input
              className="max-w-[10rem]"
              placeholder="Torre (opcional)"
              value={novaTorre}
              onChange={(e) => setNovaTorre(e.target.value)}
            />
            <Button onClick={() => criarSquad.mutate()} disabled={criarSquad.isPending}>
              {criarSquad.isPending ? 'Criando…' : 'Criar'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <h2 className="mb-3 text-lg text-ink">Squads</h2>
        <QueryState
          isLoading={permsLoading || teams.isLoading}
          error={teams.error}
          empty={(teams.data ?? []).length === 0}
          emptyLabel="Nenhum squad cadastrado."
        />
        {(teams.data ?? []).length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Squad</Th>
                <Th>Torre</Th>
                <Th>Pessoas</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(teams.data ?? []).map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium">{t.name}</Td>
                  <Td className="text-muted-ink">{t.tower ?? '—'}</Td>
                  <Td>{(members.data ?? []).filter((m) => m.team_id === t.id).length}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setSelecionado(selecionado === t.id ? '' : t.id)}
                      >
                        {selecionado === t.id ? 'Fechar' : 'Ver membros'}
                      </Button>
                      {podeReiniciar ? (
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() => {
                            setMotivo('');
                            setReiniciando({ id: t.id, name: t.name });
                          }}
                        >
                          Reiniciar assessment
                        </Button>
                      ) : null}
                      {podeExcluir ? (
                        <Button
                          variant="danger"
                          className="text-xs"
                          onClick={() => {
                            setConfirmacaoNome('');
                            setExcluindo({ id: t.id, name: t.name });
                          }}
                        >
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      {selecionado ? (
        <Card>
          <h2 className="mb-3 text-lg text-ink">
            Membros de {teams.data?.find((t) => t.id === selecionado)?.name ?? 'squad'}
          </h2>

          {podeGerirMembros ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Select value={novoMembro} onChange={(e) => setNovoMembro(e.target.value)}>
                <option value="">Escolha a pessoa…</option>
                {(profiles.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email || p.id}
                  </option>
                ))}
              </Select>
              <Select value={papelMembro} onChange={(e) => setPapelMembro(e.target.value)}>
                <option value="member">Member — participa do squad</option>
                <option value="sm">SM — facilita o assessment do squad</option>
              </Select>
              <Button onClick={() => adicionarMembro.mutate()} disabled={adicionarMembro.isPending}>
                Adicionar
              </Button>
            </div>
          ) : null}

          <QueryState
            isLoading={members.isLoading || profiles.isLoading}
            error={members.error ?? profiles.error}
            empty={membrosDoSquad.length === 0}
            emptyLabel="Squad sem membros."
          />
          {membrosDoSquad.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Pessoa</Th>
                  <Th>Papel no squad</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {membrosDoSquad.map((m) => (
                  <tr key={m.user_id}>
                    <Td>{perfilPorId.get(m.user_id) ?? m.user_id}</Td>
                    <Td>
                      <Badge tone={m.role === 'sm' ? 'success' : 'neutral'}>{m.role === 'sm' ? 'SM' : 'Member'}</Badge>
                    </Td>
                    <Td>
                      {podeGerirMembros ? (
                        <Button
                          variant="danger"
                          className="text-xs"
                          disabled={removerMembro.isPending}
                          onClick={() => removerMembro.mutate(m.user_id)}
                        >
                          Remover
                        </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        open={reiniciando !== null}
        onOpenChange={(open) => {
          if (!open) setReiniciando(null);
        }}
        title="Reiniciar assessment"
        confirmLabel="Reiniciar"
        danger
        busy={reiniciar.isPending}
        onConfirm={() => reiniciar.mutate()}
      >
        <p className="mb-3">
          O ciclo em andamento de <strong>{reiniciando?.name}</strong> é descartado e o squad
          recomeça do zero. Respostas, proposta e homologação daquele ciclo vão junto.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-ink">
            Motivo (obrigatório — fica na trilha)
          </span>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: sessão conduzida com o time errado"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={excluindo !== null}
        onOpenChange={(open) => {
          if (!open) setExcluindo(null);
        }}
        title="Excluir squad"
        confirmLabel="Excluir definitivamente"
        danger
        busy={excluir.isPending}
        onConfirm={() => excluir.mutate()}
      >
        <p className="mb-3">
          <strong>{excluindo?.name}</strong>, seus membros e todo o histórico de assessment são
          removidos. A trilha guarda um snapshot para reconstrução manual — <strong>não é backup</strong>.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-ink">
            Digite <span className="font-mono">{excluindo?.name}</span> para confirmar
          </span>
          <Input value={confirmacaoNome} onChange={(e) => setConfirmacaoNome(e.target.value)} />
        </label>
      </ConfirmDialog>
    </div>
  );
}

function explain(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/permission denied|row-level security|policy/i.test(message)) {
    return 'Você não tem permissão para essa alteração. Fale com um Admin.';
  }
  if (/squad_members_role_check/i.test(message)) {
    return 'Papel de squad inválido — só existem SM e Member. AM é papel global, concedido em Pessoas.';
  }
  return message;
}
