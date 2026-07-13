const weekOptions = Array.from({ length: 24 }, (_, index) => index + 1);

export default function PeriodSelect({ days, onChange, label = 'Período' }: { days: number; onChange: (days: number) => void; label?: string }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
    {label}
    <select value={Math.round(days / 7)} onChange={event => onChange(Number(event.target.value) * 7)} aria-label="Período de análise" style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.76rem' }}>
      {weekOptions.map(weeks => <option key={weeks} value={weeks}>{weeks === 1 ? 'Última semana' : `Últimas ${weeks} semanas`}</option>)}
    </select>
  </label>;
}
