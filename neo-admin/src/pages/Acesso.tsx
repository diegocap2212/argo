/**
 * ACESSO AO NEO — a allowlist `neo_access`.
 *
 * Ela decide quem pode RECEBER o código de acesso, antes de qualquer papel. Desde a saída da
 * LM Mobilidade (2026-09-09) não existe mais liberação por domínio: esta lista não é a das
 * exceções, é A lista. Quem não está aqui não entra.
 *
 * Até agora só existia no dashboard do Supabase — ou seja, mexer nela exigia acesso de
 * engenharia ao banco. Ganho barato desta rodada: quem governa acesso passa a fazer isso aqui.
 *
 * Desmarcar `approved` NÃO derruba sessão viva: o JWT já emitido vale até expirar. O que ele
 * corta é o próximo login e, via `is_neo_allowed()`, o papel implícito `todos` — logo, o dado.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate, useNeoAccess } from '@/lib/rbac';
import { Badge, Button, Card, Input, PageTitle, QueryState, Table, Td, Th } from '@/ui';

export function Acesso() {
  const { can, isLoading: permsLoading } = usePermissions();
  const lista = useNeoAccess();
  const qc = useQueryClient();

  const podeGerir = can('neo.access.manage');
  const [email, setEmail] = useState('');
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const invalidar = () => qc.invalidateQueries({ queryKey: ['neo_access'] });

  const adicionar = useMutation({
    mutationFn: async () => {
      const alvo = email.trim().toLowerCase();
      if (!alvo.includes('@')) throw new Error('Informe um e-mail válido.');
      const { error } = await supabase
        .from('neo_access')
        .upsert({ email: alvo, approved: true, note: nota.trim() || null }, { onConflict: 'email' });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setEmail('');
      setNota('');
      setErro(null);
      await invalidar();
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : String(e)),
  });

  const alternar = useMutation({
    mutationFn: async ({ alvo, approved }: { alvo: string; approved: boolean }) => {
      const { error } = await supabase.from('neo_access').update({ approved }).eq('email', alvo);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setErro(null);
      await invalidar();
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : String(e)),
  });

  const linhas = useMemo(
    () => [...(lista.data ?? [])].sort((a, b) => Number(b.approved) - Number(a.approved) || a.email.localeCompare(b.email)),
    [lista.data],
  );

  return (
    <div>
      <PageTitle
        title="Acesso ao NEO"
        subtitle="Quem pode entrar no NEO. Não há liberação automática por domínio: e-mail que não está aqui não recebe código de acesso."
      />

      {erro ? (
        <Card className="mb-4 border-error">
          <p className="text-sm text-error">{erro}</p>
        </Card>
      ) : null}

      {podeGerir ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg text-ink">Liberar um e-mail</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              type="email"
              placeholder="pessoa@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              className="max-w-sm"
              placeholder="Motivo (ex.: consultoria do projeto X até 12/2026)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <Button onClick={() => adicionar.mutate()} disabled={adicionar.isPending}>
              {adicionar.isPending ? 'Liberando…' : 'Liberar'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-lg text-ink">E-mails com acesso</h2>
        <QueryState
          isLoading={permsLoading || lista.isLoading}
          error={lista.error}
          empty={linhas.length === 0}
          emptyLabel="Nenhum e-mail liberado — ninguém consegue entrar no NEO."
        />
        {linhas.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>E-mail</Th>
                <Th>Situação</Th>
                <Th>Motivo</Th>
                <Th>Desde</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((row) => (
                <tr key={row.email} className={row.approved ? undefined : 'opacity-60'}>
                  <Td>
                    <span className="font-mono text-xs">{row.email}</span>
                  </Td>
                  <Td>
                    {row.approved ? <Badge tone="success">liberado</Badge> : <Badge tone="error">bloqueado</Badge>}
                  </Td>
                  <Td className="text-xs text-muted-ink">{row.note ?? '—'}</Td>
                  <Td className="text-xs text-muted-ink">{formatDate(row.created_at)}</Td>
                  <Td>
                    {podeGerir ? (
                      <Button
                        variant={row.approved ? 'danger' : 'ghost'}
                        className="text-xs"
                        disabled={alternar.isPending}
                        onClick={() => alternar.mutate({ alvo: row.email, approved: !row.approved })}
                      >
                        {row.approved ? 'Bloquear' : 'Liberar'}
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}
