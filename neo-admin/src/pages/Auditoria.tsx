/**
 * AUDITORIA — as três trilhas que o NEO guarda, numa tela só.
 *
 *   · ações destrutivas (`destructive_audit`): reiniciar assessment, excluir squad;
 *   · concessão e revogação de papel (`portal_roles`, pelas colunas de rastro);
 *   · mudanças na matriz (`neo_role_permissions_audit`).
 *
 * Ler qualquer uma exige `neo.audit.read` — mas a de PAPÉIS depende também de `portal_roles`
 * ser legível, e a RLS de lá pede `neo.roles.manage`. Quem tiver só `neo.audit.read` vê as
 * outras duas e um aviso, em vez de uma lista vazia que mentiria dizendo "nada aconteceu".
 */
import { useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import {
  formatDate,
  useDestructiveAudit,
  useMatrixAudit,
  usePermissionCatalog,
  usePortalRoles,
  useRoles,
  useTeams,
} from '@/lib/rbac';
import { Badge, Card, PageTitle, QueryState, Table, Td, Th } from '@/ui';

export function Auditoria() {
  const { can, isLoading: permsLoading } = usePermissions();
  const destrutivas = useDestructiveAudit();
  const matriz = useMatrixAudit();
  const papeis = usePortalRoles();
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const teams = useTeams();

  const podeVerPapeis = can('neo.roles.manage');

  const nomeSquad = (id: string | null) =>
    (id && teams.data?.find((t) => t.id === id)?.name) || (id ? id.slice(0, 8) : '—');
  const labelPerm = (id: string) => catalog.data?.find((p) => p.id === id)?.label ?? id;
  const labelPapel = (id: string) => roles.data?.find((r) => r.id === id)?.label ?? id;

  /** Concessões e revogações, derivadas do rastro que o banco carimba em `portal_roles`. */
  const eventosDePapel = useMemo(() => {
    const out: Array<{ key: string; quando: string; quem: string | null; alvo: string; papel: string; acao: 'concedeu' | 'revogou'; motivo: string | null }> = [];
    for (const r of papeis.data ?? []) {
      out.push({
        key: `${r.email} ${r.role} grant`,
        quando: r.created_at,
        quem: r.granted_by,
        alvo: r.email,
        papel: r.role,
        acao: 'concedeu',
        motivo: null,
      });
      if (r.revoked_at) {
        out.push({
          key: `${r.email} ${r.role} revoke`,
          quando: r.revoked_at,
          quem: r.revoked_by,
          alvo: r.email,
          papel: r.role,
          acao: 'revogou',
          motivo: r.revoke_reason,
        });
      }
    }
    return out.sort((a, b) => (a.quando < b.quando ? 1 : -1));
  }, [papeis.data]);

  return (
    <div>
      <PageTitle
        title="Auditoria"
        subtitle="Quem fez o quê, quando e por quê. As três trilhas são append-only: nada aqui é editável pela aplicação."
      />

      <Card className="mb-4">
        <h2 className="mb-3 text-lg text-ink">Papéis concedidos e revogados</h2>
        {!podeVerPapeis ? (
          <p className="py-2 text-sm text-warning">
            Esta trilha exige a função <strong>Conceder e revogar papéis de pessoas</strong> — sem ela o banco não
            devolve as linhas, e uma lista vazia aqui diria algo falso.
          </p>
        ) : (
          <>
            <QueryState
              isLoading={permsLoading || papeis.isLoading}
              error={papeis.error}
              empty={eventosDePapel.length === 0}
              emptyLabel="Nenhum papel concedido ainda."
            />
            {eventosDePapel.length > 0 ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Quando</Th>
                    <Th>Quem fez</Th>
                    <Th>Sobre quem</Th>
                    <Th>Papel</Th>
                    <Th>Ação</Th>
                    <Th>Motivo</Th>
                  </tr>
                </thead>
                <tbody>
                  {eventosDePapel.map((e) => (
                    <tr key={e.key}>
                      <Td>{formatDate(e.quando)}</Td>
                      <Td className="text-xs">{e.quem ?? '—'}</Td>
                      <Td className="font-mono text-xs">{e.alvo}</Td>
                      <Td>{labelPapel(e.papel)}</Td>
                      <Td>
                        {e.acao === 'concedeu' ? (
                          <Badge tone="success">concedeu</Badge>
                        ) : (
                          <Badge tone="error">revogou</Badge>
                        )}
                      </Td>
                      <Td className="text-xs text-muted-ink">{e.motivo ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-lg text-ink">Mudanças na matriz de papéis × funções</h2>
        <QueryState
          isLoading={matriz.isLoading}
          error={matriz.error}
          empty={(matriz.data ?? []).length === 0}
          emptyLabel="A matriz está como foi instalada."
        />
        {(matriz.data ?? []).length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>Função</Th>
                <Th>Papel</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {(matriz.data ?? []).map((row) => (
                <tr key={row.id}>
                  <Td>{formatDate(row.at)}</Td>
                  <Td className="text-xs">{row.actor_email ?? '—'}</Td>
                  <Td>{labelPerm(row.permission_id)}</Td>
                  <Td>{labelPapel(row.role_id)}</Td>
                  <Td>
                    {row.action === 'grant' ? <Badge tone="success">ligou</Badge> : <Badge tone="warning">desligou</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg text-ink">Ações destrutivas</h2>
        <QueryState
          isLoading={destrutivas.isLoading}
          error={destrutivas.error}
          empty={(destrutivas.data ?? []).length === 0}
          emptyLabel="Nenhuma ação destrutiva registrada."
        />
        {(destrutivas.data ?? []).length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>O quê</Th>
                <Th>Squad</Th>
                <Th>Motivo</Th>
              </tr>
            </thead>
            <tbody>
              {(destrutivas.data ?? []).map((row) => (
                <tr key={row.id}>
                  <Td>{formatDate(row.created_at)}</Td>
                  <Td className="text-xs">{row.actor_email ?? '—'}</Td>
                  <Td>{row.action}</Td>
                  <Td>{nomeSquad(row.team_id)}</Td>
                  <Td className="text-xs text-muted-ink">{row.reason ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}
