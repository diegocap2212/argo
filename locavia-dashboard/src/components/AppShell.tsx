import { useEffect, useRef, useState } from 'react';
import { Building2, Car, Home, LogOut, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SM_CONFIGS } from '../config/sm-config';
import { deriveTeams } from '../config/teams';
import { teamLabel } from '../config/teamLabels';
import { logout } from '../services/authService';
import { fetchData } from '../services/dataService';
import Button from './ui/Button';
import VeniceBadge from './VeniceBadge';

/** Wordmark "Performance Dash" (símbolo de barras + texto), conforme o logo do produto. */
function PerformanceDashMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }} aria-label="Performance Dash">
      <span style={{ width: 24, height: 20, display: 'flex', alignItems: 'flex-end', gap: 2 }} aria-hidden="true">
        <i style={{ width: 6, height: 9, background: '#171a17', transform: 'skewY(-28deg)', display: 'block' }} />
        <i style={{ width: 6, height: 15, background: '#171a17', transform: 'skewY(-28deg)', display: 'block' }} />
        <i style={{ width: 6, height: 20, background: 'var(--accent)', transform: 'skewY(-28deg)', display: 'block' }} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.5 }}>
          <span style={{ color: 'var(--text-primary)' }}>PERFORMANCE</span> <b style={{ color: 'var(--accent-strong)' }}>DASH</b>
        </span>
        <small style={{ fontSize: 6.5, letterSpacing: 2.5, color: 'var(--text-muted)', marginTop: 4 }}>OPERATION INTELLIGENCE</small>
      </span>
    </div>
  );
}

const railButton = (active = false): React.CSSProperties => ({
  width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center',
  border: 0, cursor: 'pointer', transition: 'background 160ms ease, color 160ms ease',
  color: active ? '#ffffff' : '#9aa19b',
  background: active ? '#242925' : 'transparent',
  boxShadow: active ? 'inset 3px 0 0 0 var(--accent)' : 'none',
});

function GlobalNavItem({ label, icon: Icon, active, onClick }: { label: string; icon: React.ComponentType<{ size?: number }>; active?: boolean; onClick: () => void }) {
  return <button title={label} aria-label={label} onClick={onClick} style={railButton(active)}><Icon size={20} /></button>;
}

function ContextNavItem({ label, icon: Icon, active, items }: { label: string; icon: React.ComponentType<{ size?: number }>; active?: boolean; items: Array<{ id: string; label: string; active: boolean; onSelect: () => void }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return <div ref={ref} style={{ position: 'relative' }}>
    <button title={label} aria-label={label} onClick={() => setOpen(value => !value)} style={railButton(active || open)}><Icon size={20} /></button>
    {open && <div role="menu" style={{ position: 'absolute', left: 54, top: 0, zIndex: 300, width: 240, maxHeight: 440, overflowY: 'auto', padding: 6, borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}>
      <p style={{ margin: '0.35rem 0.55rem 0.5rem', fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      {items.map(item => <button key={item.id} role="menuitem" onClick={() => { item.onSelect(); setOpen(false); }} style={{ display: 'block', width: '100%', padding: '0.6rem 0.7rem', border: 0, borderRadius: 8, textAlign: 'left', cursor: 'pointer', color: item.active ? 'var(--accent-strong)' : 'var(--text-secondary)', background: item.active ? 'var(--accent-soft)' : 'transparent', fontSize: '0.78rem', fontWeight: item.active ? 600 : 500 }}>{item.label}</button>)}
    </div>}
  </div>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [teams, setTeams] = useState<string[]>([]);
  const activeSm = location.pathname.startsWith('/sm/') ? location.pathname.split('/sm/')[1] : null;
  const activeTeam = location.pathname.startsWith('/time/') ? decodeURIComponent(location.pathname.split('/time/')[1]) : null;
  const embedded = new URLSearchParams(location.search).get('embed') === '1';

  useEffect(() => {
    if (embedded) return;
    let alive = true;
    fetchData().then(items => { if (alive) setTeams(deriveTeams(items)); }).catch(() => {});
    return () => { alive = false; };
  }, [embedded]);

  const handleLogout = async () => { await logout(); };

  if (embedded) {
    return <div data-embed="maturity" style={{ minHeight: '100vh', background: 'var(--page)', fontFamily: 'Inter, system-ui, sans-serif' }}>{children}</div>;
  }

  return <div style={{ minHeight: '100vh', display: 'flex', background: 'transparent', fontFamily: 'Inter, system-ui, sans-serif' }}>
    <aside aria-label="Navegação global" style={{ width: 76, background: '#111412', borderRight: '1px solid #1e231f', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1.1rem 0', position: 'sticky', top: 0, height: '100vh', flexShrink: 0, zIndex: 200 }}>
      <div style={{ height: '0.6rem' }} />
      <GlobalNavItem label="Início" icon={Home} active={location.pathname === '/'} onClick={() => navigate('/')} />
      <GlobalNavItem label="Torre" icon={Building2} active={location.pathname.startsWith('/sm/') || location.pathname.startsWith('/time/')} onClick={() => navigate('/')} />
      <ContextNavItem label="Agilistas" icon={Users} active={!!activeSm} items={SM_CONFIGS.map(sm => ({ id: sm.id, label: sm.name, active: activeSm === sm.id, onSelect: () => navigate(`/sm/${sm.id}`) }))} />
      <ContextNavItem label="Times" icon={Car} active={!!activeTeam} items={teams.map(team => ({ id: team, label: teamLabel(team), active: activeTeam === team, onSelect: () => navigate(`/time/${encodeURIComponent(team)}`) }))} />
    </aside>

    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <header className="vds-topbar" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: '1rem', minHeight: 60, padding: '0 1.75rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, display: 'flex' }} aria-label="Início · Venice"><VeniceBadge height={22} /></button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><PerformanceDashMark /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
          <img src="/lm-mobilidade.png" alt="LM Mobilidade" style={{ height: 26, width: 'auto', display: 'block' }} />
          <Button variant="secondary" size="sm" onClick={handleLogout} title="Sair" icon={<LogOut size={15} />}>Sair</Button>
        </div>
      </header>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  </div>;
}
