import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface JourneyItem { label: string; href?: string; active?: boolean }

export default function ContextJourney({ agilista, team }: { agilista?: { id: string; name: string }; team?: string }) {
  const navigate = useNavigate();
  const items: JourneyItem[] = [
    { label: 'Torre', href: '/' },
    ...(agilista ? [{ label: agilista.name, href: `/sm/${agilista.id}` }] : []),
    ...(team ? [{ label: team }] : []),
    { label: 'Métricas', active: !team },
  ];
  return <nav aria-label="Jornada de contexto" style={{ maxWidth: 1500, margin: '0 auto', padding: '0.75rem 2.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', overflowX: 'auto' }}>
    {items.map((item, index) => <span key={`${item.label}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
      {index > 0 && <ChevronRight size={13} aria-hidden />}
      <button
        type="button"
        onClick={item.href ? () => navigate(item.href!) : undefined}
        disabled={!item.href}
        style={{ border: 0, background: 'transparent', padding: '0.2rem 0.35rem', cursor: item.href ? 'pointer' : 'default', color: item.active || index === items.length - 1 ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: item.active || index === items.length - 1 ? 600 : 500 }}
      >{item.label}</button>
    </span>)}
  </nav>;
}
