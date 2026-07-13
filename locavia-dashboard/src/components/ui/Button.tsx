import React from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** mostra spinner e desabilita o clique */
  loading?: boolean;
  /** ícone à esquerda do texto */
  icon?: React.ReactNode;
}

/**
 * Botão do Design System Venice.
 * Variantes: primary (preto↔branco), accent (verde neon), secondary (outline),
 * tertiary (ghost), destructive. Estados de hover/active/focus/disabled/loading
 * vêm das classes `.vds-btn*` em App.css (theme-aware via tokens).
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  children,
  ...rest
}) => (
  <button
    className={`vds-btn vds-btn-${size} vds-btn-${variant} ${className}`.trim()}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <span className="vds-spin" aria-hidden /> : icon}
    {children}
  </button>
);

export default Button;
