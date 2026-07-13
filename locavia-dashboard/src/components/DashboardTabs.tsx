export type DashboardTab = 'overview' | 'flow' | 'commitment' | 'time';

const tabs: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'flow', label: 'Fluxo' },
  { id: 'commitment', label: 'Compromisso' },
  { id: 'time', label: 'Tempo' },
];

export default function DashboardTabs({ value, onChange }: { value: DashboardTab; onChange: (tab: DashboardTab) => void }) {
  return <nav className="dashboard-tabs" aria-label="Jornada de análise">
    {tabs.map(tab => <button key={tab.id} type="button" className={value === tab.id ? 'active' : ''} aria-current={value === tab.id ? 'page' : undefined} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
  </nav>;
}
