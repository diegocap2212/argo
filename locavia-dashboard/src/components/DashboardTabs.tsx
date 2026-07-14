export type DashboardTab = 'delivery' | 'speed' | 'health' | 'epics' | 'forecast';

const tabs: { id: DashboardTab; label: string }[] = [
  { id: 'delivery', label: 'Entrega' },
  { id: 'speed', label: 'Tempo & Gargalos' },
  { id: 'health', label: 'Saúde & Prioridades' },
  { id: 'epics', label: 'Épicos' },
  { id: 'forecast', label: 'Previsão' },
];

export default function DashboardTabs({ value, onChange }: { value: DashboardTab; onChange: (tab: DashboardTab) => void }) {
  return <nav className="dashboard-tabs" aria-label="Jornada de análise">
    {tabs.map(tab => <button key={tab.id} type="button" className={value === tab.id ? 'active' : ''} aria-current={value === tab.id ? 'page' : undefined} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
  </nav>;
}
