import React from 'react';

export interface HeroStatus {
  label: string;
  /** cores via tokens de feedback do DS (pill claro) */
  bg: string;
  text: string;
  border: string;
}

interface Props {
  /** breadcrumb mono em caixa alta, ex.: "RELEASE · LM" (texto ou nó, p/ logo) */
  eyebrow: React.ReactNode;
  title: string;
  /** linha de subtítulo abaixo do título (opcional) */
  subtitle?: React.ReactNode;
  /** elemento à esquerda do título (ex.: avatar) */
  leading?: React.ReactNode;
  /** badge de status à direita do título */
  status?: HeroStatus;
  /** conteúdo abaixo do cabeçalho (controles, seletor de release, etc.) */
  children?: React.ReactNode;
}

/**
 * Hero claro branded (DS Venice) — compartilhado por Home, /release/:id e /sm/:id.
 * Superfície clara (--hero-bg) + leve glow verde de acento. Coerência entre as visões.
 */
const PageHero: React.FC<Props> = ({ eyebrow, title, subtitle, leading, status, children }) => (
  <div style={{ background: 'var(--hero-bg)', position: 'relative', padding: '2.25rem 2.5rem 1.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
    {/* glow radial (confinado ao próprio div via inset:0 — não precisa de overflow:hidden no pai,
        que cortaria os menus de dropdown abertos sobre o hero) */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'var(--hero-glow)',
    }} />

    <div style={{ maxWidth: 1500, margin: '0 auto', position: 'relative' }}>
      <p style={{ margin: '0 0 0.5rem', fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
        {eyebrow}
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: children ? '1.5rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {leading}
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--hero-fg)', lineHeight: 1.1 }}>
              {title}
            </h1>
            {subtitle && (
              <div style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {status && (
          <span style={{
            padding: '6px 16px', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
            background: status.bg, color: status.text, border: `1px solid ${status.border}`,
          }}>
            {status.label}
          </span>
        )}
      </div>

      {children}
    </div>
  </div>
);

/** Deriva o status branded a partir das datas de projeção (mesma regra da home). */
// eslint-disable-next-line react-refresh/only-export-components
export function deriveStatus(remaining: number, entregaMelhor: Date | null, entregaPior: Date | null, now = new Date()): HeroStatus {
  const isDelivered = remaining === 0;
  const isLate = !isDelivered && !!entregaPior && entregaPior < now;
  const isAtRisk = !isDelivered && !isLate && !!entregaMelhor && entregaMelhor > new Date(now.getTime() + 60 * 86400000);

  if (isDelivered) return { label: 'Entregue', bg: 'var(--ok-bg)', text: 'var(--ok-fg)', border: 'var(--ok-bg)' };
  if (isLate) return { label: 'Atrasado', bg: 'var(--err-bg)', text: 'var(--err-fg)', border: 'var(--err-bg)' };
  if (isAtRisk) return { label: 'Em Risco', bg: 'var(--warn-bg)', text: 'var(--warn-fg)', border: 'var(--warn-bg)' };
  return { label: 'No Prazo', bg: 'var(--ok-bg)', text: 'var(--ok-fg)', border: 'var(--ok-bg)' };
}

export default PageHero;
