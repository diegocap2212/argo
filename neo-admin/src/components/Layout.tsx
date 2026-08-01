import { NavLink, Outlet } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/cn';

/**
 * As seções e a permissão que cada uma exige.
 *
 * A seção some quando a permissão falta — mas isso é COSMÉTICO. Quem barra de verdade é a RLS:
 * abrir a rota na mão mostra uma tela que não lê nada e não escreve nada.
 */
const SECTIONS = [
  { to: '/pessoas', label: 'Pessoas', perm: 'neo.roles.manage' },
  { to: '/matriz', label: 'Papéis × Funções', perm: 'neo.matrix.manage' },
  { to: '/acesso', label: 'Acesso ao NEO', perm: 'neo.access.manage' },
  { to: '/squads', label: 'Squads e membros', perm: 'mma.member.manage' },
  { to: '/auditoria', label: 'Auditoria', perm: 'neo.audit.read' },
] as const;

export function Layout() {
  const { can, isLoading } = usePermissions();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <a href="/" className="font-display text-lg text-ink">
            NEO <span className="text-muted-ink">· Administração</span>
          </a>
          <nav className="flex flex-wrap gap-1" aria-label="Seções da administração">
            {SECTIONS.filter((s) => isLoading || can(s.perm)).map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-neo px-3 py-1.5 text-sm transition',
                    isActive ? 'bg-ink text-white' : 'text-muted-ink hover:bg-hover hover:text-ink',
                  )
                }
              >
                {s.label}
              </NavLink>
            ))}
          </nav>
          <a href="/" className="ml-auto text-sm text-muted-ink hover:text-ink">
            ← Voltar ao NEO
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
