import React from 'react';
import { useTheme } from '../theme/ThemeProvider';

export interface VeniceBadgeProps {
  /** altura do logo em px */
  height?: number;
  /** moldura sutil (chip) verde ao redor do logo */
  framed?: boolean;
  /** força a cor do logo (útil sobre fundos coloridos): 'dark' | 'light' | 'auto' */
  tone?: 'dark' | 'light' | 'auto';
  style?: React.CSSProperties;
}

/**
 * Badge de marca Venice — DS Blite/Venice.
 * Usa o logo OFICIAL `venice-by-blite.svg`. O logo é monocromático e adapta ao tema:
 * escuro no chrome claro (light) e branco no dark — `tone` permite forçar.
 */
export const VeniceBadge: React.FC<VeniceBadgeProps> = ({ height = 24, framed = false, tone = 'auto', style }) => {
  const { theme } = useTheme();
  const dark = tone === 'auto' ? theme !== 'dark' : tone === 'dark';
  // brightness(0) = preto; + invert(1) = branco
  const filter = dark ? 'brightness(0)' : 'brightness(0) invert(1)';

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        ...(framed
          ? {
              padding: '0.32rem 0.7rem', borderRadius: 10,
              background: 'var(--accent-soft)',
              border: '1px solid var(--border-subtle)',
            }
          : {}),
        ...style,
      }}
    >
      <img
        src="/venice-by-blite.svg"
        alt="Venice by blite"
        style={{ height, width: 'auto', display: 'block', filter }}
      />
    </span>
  );
};

export default VeniceBadge;
