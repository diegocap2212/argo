import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  /** cor de accent da borda esquerda + ícone (marca). Default verde Venice. */
  accent?: string;
  /** compat legado — ignorado a favor de `accent` */
  iconColorClass?: string;
}

/**
 * KPI card branded — compartilhado por Home, /release/:id e /sm/:id.
 * Valor em mono, borda-accent à esquerda (alinhado ao visual da home).
 */
export const KPICard: React.FC<KPICardProps> = ({ title, value, subtext, icon: Icon, accent = 'var(--accent)' }) => (
  <div
    className="premium-card"
    style={{ padding: '1.2rem 1.4rem', borderLeft: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
      <h3 style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
        {title}
      </h3>
      {Icon && (
        <div style={{ display: 'flex', color: accent, opacity: 0.85 }}>
          <Icon size={17} />
        </div>
      )}
    </div>
    <div style={{ fontFamily: 'var(--font-data)', fontSize: '1.8rem', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-main)', lineHeight: 1 }}>
      {value}
    </div>
    {subtext && (
      <p style={{ margin: '0.4rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}>
        {subtext}
      </p>
    )}
  </div>
);
