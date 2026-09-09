/**
 * PESSOAS — lista de gente à esquerda, FICHA da pessoa à direita.
 *
 * POR QUE FICHA E NÃO TABELA DE CONCESSÕES: a pergunta que o administrador tem na cabeça é
 * sobre a PESSOA ("o Tiago saiu; quem entra e em quais times?"), não sobre a concessão. Com a
 * tabela antiga, trocar alguém de três squads era abrir três telas de squad; aqui é um lugar só.
 *
 * A LISTA É UMA UNIÃO, e isso não é detalhe: quem tem conta vem de `profiles`, quem só recebeu
 * papel por e-mail vem de `portal_roles`. Quem está no segundo grupo e não no primeiro **nunca
 * fez login** — e, como `squad_members` é chaveado por `user_id`, para essa pessoa o bloco de
 * squads aparece desabilitado com a explicação. A regra do repo é não renderizar formulário que
 * o banco vai recusar: o erro só apareceria no envio.
 *
 * NADA AQUI AUTORIZA. Cada bloco some sem a permissão correspondente, mas quem recusa de fato é
 * a RLS. O efeito colateral desejado: o Admin renomeia e mexe em squads; conceder papel exige
 * Admin Geral.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';
import {
  buildPeople,
  usePortalRoles,
  useProfiles,
  useRoles,
  useSquadMembers,
  useTeams,
  type Person,
} from '@/lib/rbac';
import { Badge, Button, Card, ConfirmDialog, Input, PageTitle, QueryState, Select, Table, Td, Th } from '@/ui';
import { cn } from '@/lib/cn';

export function Pessoas() {
  const { can, isLoading: permsLoading } = usePermissions();
  const roles = useRoles();
  const grants = usePortalRoles();
  const profiles = useProfiles();
  const members = useSquadMembers();
  const teams = useTeams();
  const qc = useQueryClient();

  const podePapeis = can('neo.roles.manage');
  const podeNome = can('neo.people.edit_any');
  const podeSquads = can('mma.member.manage');
  const podeDesligar = podePapeis && podeSquads;

  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [nomeRascunho, setNomeRascunho] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [revogando, setRevogando] = useState<{ email: string; role: string } | null>(null);
  const [desligando, setDesligando] = useState<Person | null>(null);
  const [novoPapel, setNovoPapel] = useState('');
  const [novoEmail, setNovoEmail] = useState('');

  const pessoas = useMemo(
    () => buildPeople(profiles.data ?? [], grants.data ?? [], members.data ?? []),
    [profiles.data, grants.data, members.data],
  );

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return pessoas;
    return pessoas.filter((p) => p.email.includes(t) || (p.nome ?? '').toLowerCase().includes(t));
  }, [pessoas, busca]);

  const pessoa = useMemo(
    () => pessoas.find((p) => p.email === selecionado) ?? null,
    [pessoas, selecionado],
  );

  const papeisGlobais = useMemo(
    () => (roles.data ?? []).filter((r) => r.scope === 'global' && r.grantable),
    [roles.data],
  );
  const labelPapel = (id: string) => roles.data?.find((r) => r.id === id)?.label ?? id;

  const invalidar = async () => {
    for (const k of ['portal_roles', 'profiles', 'squad_members', 'v_portal_roles_orfaos', 'destructive_audit']) {
      await qc.invalidateQueries({ queryKey: [k] });
    }
  };
  const feito = async (msg: string) => {
    setErro(null);
    setOk(msg);
    await invalidar();
  };

  // ── Mutações ────────────────────────────────────────────────────────────

  const salvarNome = useMutation({
    mutationFn: async () => {
      if (!pessoa?.userId) throw new Error('Esta pessoa ainda não fez login — não há perfil para renomear.');
      const nome = (nomeRascunho ?? '').trim();
      if (!nome) throw new Error('O nome não pode ficar vazio.');
      const { error } = await supabase.from('profiles').update({ full_name: nome }).eq('id', pessoa.userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setNomeRascunho(null);
      await feito('Nome atualizado.');
    },
    onError: (e: unknown) => setErro(explain(e)),
  });

  const conceder = useMutation({
    mutationFn: async () => {
      const email = (pessoa?.email ?? novoEmail).trim().toLowerCase();
      if (!email) throw new Error('Informe o e-mail.');
      if (!novoPapel) throw new Error('Escolha o papel.');
      // Reativar quem foi revogado é a MESMA linha (PK é (email, role)), então os carimbos de
      // revogação precisam ser limpos — senão o "grant" grava e a pessoa segue sem acesso.
      const { error } = await supabase
        .from('portal_roles')
        .upsert(
          { email, role: novoPapel, revoked_at: null, revoked_by: null, revoke_reason: null },
          { onConflict: 'email,role' },
        );
      if (error) throw new Error(error.message);
      return email;
    },
    onSuccess: async (email) => {
      setNovoPapel('');
      setNovoEmail('');
      setSelecionado(email);
      await feito('Papel concedido.');
    },
    onError: (e: unknown) => setErro(explain(e)),
  });

  const revogar = useMutation({
    mutationFn: async () => {
      if (!revogando) return;
      if (!motivo.trim()) throw new Error('O motivo é obrigatório.');
      const { error } = await supabase
        .from('portal_roles')
        .update({ revoked_at: new Date().toISOString(), revoke_reason: motivo.trim() })
        .eq('email', revogando.email)
        .eq('role', revogando.role);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setRevogando(null);
      setMotivo('');
      await feito('Papel revogado.');
    },
    onError: (e: unknown) => {
      setRevogando(null);
      setErro(explain(e));
    },
  });

  /**
   * Define o papel da pessoa NUM squad. A PK de `squad_members` é (team_id, user_id, role) —
   * três colunas —, então a mesma pessoa pode existir duas vezes no mesmo squad. Apagar antes é
   * o que dá a semântica de "um papel por pessoa por squad", a única que faz sentido desde que
   * os papéis viraram só sm/member.
   */
  const definirSquad = useMutation({
    mutationFn: async ({ teamId, role }: { teamId: string; role: string }) => {
      if (!pessoa?.userId) throw new Error('Esta pessoa ainda não fez login.');
      const { error: limpeza } = await supabase
        .from('squad_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', pessoa.userId);
      if (limpeza) throw new Error(limpeza.message);
      if (role) {
        const { error } = await supabase
          .from('squad_members')
          .insert({ team_id: teamId, user_id: pessoa.userId, role });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => feito('Squads atualizados.'),
    onError: (e: unknown) => setErro(explain(e)),
  });

  const desligar = useMutation({
    mutationFn: async () => {
      if (!desligando) return null;
      if (!motivo.trim()) throw new Error('O motivo é obrigatório.');
      const { data, error } = await supabase.rpc('offboard_person', {
        p_email: desligando.email,
        p_reason: motivo.trim(),
      });
      if (error) throw new Error(error.message);
      return data as { papeis_revogados: number; squads_removidos: number } | null;
    },
    onSuccess: async (r) => {
      setDesligando(null);
      setMotivo('');
      await feito(
        r ? `Desligado: ${r.papeis_revogados} papel(éis) revogado(s), ${r.squads_removidos} squad(s) removido(s).` : 'Desligado.',
      );
    },
    onError: (e: unknown) => {
      setDesligando(null);
      setErro(explain(e));
    },
  });

  const carregando = permsLoading || profiles.isLoading || grants.isLoading || members.isLoading;
  const erroLeitura = profiles.error ?? grants.error ?? members.error;

  return (
    <div>
      <PageTitle
        title="Pessoas"
        subtitle="Quem existe no NEO, o que cada um pode e em quais squads está. Papel global vale em todos os squads; papel de squad vale só naquele."
      />

      {erro ? (
        <Card className="mb-4 border-error">
          <p className="text-sm text-error">{erro}</p>
        </Card>
      ) : null}
      {ok ? (
        <Card className="mb-4 border-success">
          <p className="text-sm text-success">{ok}</p>
        </Card>
      ) : null}

      <QueryState isLoading={carregando} error={erroLeitura} />

      {!carregando && !erroLeitura ? (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          {/* ── Lista ─────────────────────────────────────────────── */}
          <Card className="h-fit">
            <Input
              className="mb-3"
              placeholder="Buscar por nome ou e-mail…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <p className="mb-2 text-xs text-muted-ink">{filtradas.length} pessoa(s)</p>
            <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
              {filtradas.map((p) => (
                <li key={p.email}>
                  <button
                    onClick={() => {
                      setSelecionado(p.email);
                      setNomeRascunho(null);
                      setErro(null);
                      setOk(null);
                    }}
                    className={cn(
                      'w-full rounded-neo px-3 py-2 text-left text-sm transition',
                      selecionado === p.email ? 'bg-ink text-white' : 'hover:bg-hover',
                    )}
                  >
                    <span className="block truncate">{p.nome && !p.nomeEhEmail ? p.nome : p.email}</span>
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-xs',
                        selecionado === p.email ? 'text-white/70' : 'text-muted-ink',
                      )}
                    >
                      {p.papeis.length ? p.papeis.map(labelPapel).join(' · ') : 'sem papel global'}
                      {p.userId ? '' : ' · nunca entrou'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {/* ── Ficha ─────────────────────────────────────────────── */}
          {!pessoa ? (
            <Card>
              <p className="text-sm text-muted-ink">Escolha uma pessoa na lista para ver e editar a ficha dela.</p>
              {podePapeis ? (
                <div className="mt-6 border-t border-line pt-4">
                  <h2 className="mb-2 text-lg text-ink">Conceder papel a quem ainda não está aqui</h2>
                  <p className="mb-3 text-xs text-muted-ink">
                    Vale para quem nunca fez login: o vínculo é resolvido no primeiro acesso. Squads, esses só
                    depois que a pessoa entrar.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="max-w-xs"
                      type="email"
                      placeholder="pessoa@exemplo.com"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                    />
                    <Select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)}>
                      <option value="">Escolha o papel…</option>
                      {papeisGlobais.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <Button onClick={() => conceder.mutate()} disabled={conceder.isPending}>
                      Conceder
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Identidade */}
              <Card>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h2 className="text-xl text-ink">{pessoa.nome && !pessoa.nomeEhEmail ? pessoa.nome : pessoa.email}</h2>
                  {!pessoa.userId ? <Badge tone="warning">nunca fez login</Badge> : null}
                  {pessoa.nomeEhEmail ? <Badge tone="warning">nome nunca definido</Badge> : null}
                </div>

                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-ink">E-mail</dt>
                    <dd className="font-mono text-sm">{pessoa.email}</dd>
                    <p className="mt-1 text-xs text-muted-ink">
                      É a identidade do login e não se edita aqui — muda no Supabase.
                    </p>
                  </div>

                  <div>
                    <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-ink">Nome</dt>
                    <dd>
                      {!pessoa.userId ? (
                        <p className="text-sm text-muted-ink">
                          O perfil só existe depois do primeiro login — não há nome para editar ainda.
                        </p>
                      ) : podeNome ? (
                        <div className="flex flex-wrap gap-2">
                          <Input
                            className="max-w-sm"
                            value={nomeRascunho ?? (pessoa.nomeEhEmail ? '' : (pessoa.nome ?? ''))}
                            placeholder={pessoa.nomeEhEmail ? 'Nome da pessoa' : ''}
                            onChange={(e) => setNomeRascunho(e.target.value)}
                          />
                          <Button
                            onClick={() => salvarNome.mutate()}
                            disabled={salvarNome.isPending || nomeRascunho === null}
                          >
                            Salvar nome
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm">{pessoa.nomeEhEmail ? '—' : pessoa.nome}</p>
                      )}
                      {pessoa.nomeEhEmail ? (
                        <p className="mt-1 text-xs text-warning">
                          O login por e-mail não envia nome, então o sistema usou o próprio e-mail. É isto que
                          aparece nas telas do MMA até alguém corrigir.
                        </p>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </Card>

              {/* Papel global */}
              <Card>
                <h2 className="mb-1 text-lg text-ink">Papel global</h2>
                <p className="mb-3 text-xs text-muted-ink">Vale em TODOS os squads.</p>

                {pessoa.papeis.length === 0 && !pessoa.temGrantRevogado ? (
                  <p className="mb-3 text-sm text-muted-ink">Sem papel global — participa apenas dos squads abaixo.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Papel</Th>
                        <Th>O que significa</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {pessoa.papeis.map((r) => (
                        <tr key={r}>
                          <Td className="font-medium">{labelPapel(r)}</Td>
                          <Td className="text-xs text-muted-ink">
                            {roles.data?.find((x) => x.id === r)?.description ?? '—'}
                          </Td>
                          <Td>
                            {podePapeis ? (
                              <Button
                                variant="danger"
                                className="text-xs"
                                onClick={() => {
                                  setMotivo('');
                                  setRevogando({ email: pessoa.email, role: r });
                                }}
                              >
                                Revogar
                              </Button>
                            ) : null}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}

                {podePapeis ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)}>
                      <option value="">Conceder papel…</option>
                      {papeisGlobais
                        .filter((r) => !pessoa.papeis.includes(r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                    </Select>
                    <Button onClick={() => conceder.mutate()} disabled={conceder.isPending || !novoPapel}>
                      Conceder
                    </Button>
                  </div>
                ) : null}
              </Card>

              {/* Squads */}
              <Card>
                <h2 className="mb-1 text-lg text-ink">Squads</h2>
                <p className="mb-3 text-xs text-muted-ink">
                  Papel de squad vale só naquele squad. SM conduz o assessment; Member participa.
                </p>

                {!pessoa.userId ? (
                  <p className="text-sm text-warning">
                    Esta pessoa nunca fez login, e o vínculo de squad é por conta de usuário — não por e-mail.
                    Assim que ela entrar pela primeira vez, os squads podem ser atribuídos aqui.
                  </p>
                ) : (
                  <QueryState isLoading={teams.isLoading} error={teams.error} empty={(teams.data ?? []).length === 0} />
                )}

                {pessoa.userId && (teams.data ?? []).length > 0 ? (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Squad</Th>
                        <Th>Torre</Th>
                        <Th>Papel</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(teams.data ?? []).map((t) => {
                        const atual = pessoa.squads.find((s) => s.teamId === t.id)?.role ?? '';
                        return (
                          <tr key={t.id}>
                            <Td className="font-medium">{t.name}</Td>
                            <Td className="text-muted-ink">{t.tower ?? '—'}</Td>
                            <Td>
                              <Select
                                value={atual}
                                disabled={!podeSquads || definirSquad.isPending}
                                onChange={(e) => definirSquad.mutate({ teamId: t.id, role: e.target.value })}
                              >
                                <option value="">— fora do squad —</option>
                                <option value="member">Member</option>
                                <option value="sm">SM</option>
                              </Select>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                ) : null}
              </Card>

              {/* Desligar */}
              {podeDesligar ? (
                <Card className="border-error">
                  <h2 className="mb-1 text-lg text-ink">Desligar esta pessoa</h2>
                  <p className="mb-3 text-xs text-muted-ink">
                    Revoga todos os papéis globais e remove de todos os squads, de uma vez e com trilha. O perfil e
                    o histórico permanecem — desligar tira o acesso, não o registro.
                  </p>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setMotivo('');
                      setDesligando(pessoa);
                    }}
                  >
                    Desligar {pessoa.nome && !pessoa.nomeEhEmail ? pessoa.nome : pessoa.email}
                  </Button>
                </Card>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={revogando !== null}
        onOpenChange={(o) => {
          if (!o) setRevogando(null);
        }}
        title="Revogar papel"
        confirmLabel="Revogar"
        danger
        busy={revogar.isPending}
        onConfirm={() => revogar.mutate()}
      >
        <p className="mb-3">
          <strong>{revogando?.email}</strong> perde o papel{' '}
          <strong>{revogando ? labelPapel(revogando.role) : ''}</strong>. O acesso ao dado é cortado na hora; a
          navegação, na próxima passagem pelo hub.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-ink">
            Motivo (obrigatório)
          </span>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: mudou de área" />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={desligando !== null}
        onOpenChange={(o) => {
          if (!o) setDesligando(null);
        }}
        title="Desligar pessoa"
        confirmLabel="Desligar"
        danger
        busy={desligar.isPending}
        onConfirm={() => desligar.mutate()}
      >
        <p className="mb-2">
          <strong>{desligando?.email}</strong> perde:
        </p>
        <ul className="mb-3 list-disc pl-5">
          <li>
            {desligando?.papeis.length
              ? `${desligando.papeis.map(labelPapel).join(', ')} (papel global)`
              : 'nenhum papel global'}
          </li>
          <li>{desligando?.squads.length ?? 0} vínculo(s) de squad</li>
        </ul>
        <p className="mb-3 text-xs">
          Tudo numa transação: ou as duas coisas acontecem, ou nenhuma. Se esta for a última pessoa capaz de
          administrar o NEO, o banco recusa.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-ink">
            Motivo (obrigatório)
          </span>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: saiu da empresa em 31/07"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}

function explain(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/DESLIGAMENTO ABORTADO/i.test(message)) return message.replace(/^.*DESLIGAMENTO ABORTADO:\s*/i, '');
  if (/last_admin|último|protect_last_admin/i.test(message)) {
    return 'Isso deixaria o NEO sem nenhum Admin Geral. Conceda o papel a outra pessoa antes.';
  }
  if (/permission denied|row-level security|policy/i.test(message)) {
    return 'Você não tem permissão para essa alteração. Fale com um Admin Geral.';
  }
  if (/violates foreign key/i.test(message)) {
    return 'Papel ou squad inexistente. Recarregue a página — a lista pode ter mudado.';
  }
  return message;
}
