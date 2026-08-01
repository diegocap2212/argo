import type { Config } from 'tailwindcss';

/**
 * As cores saem de `@neo/design` (tokens.css), nunca de hex solto: é o mesmo verde do hub, do
 * Dash e do Nero. Ver packages/neo-design/README.md para o porquê do prefixo `--neo-`.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--neo-brand)',
        'brand-strong': 'var(--neo-brand-strong)',
        'brand-muted': 'var(--neo-brand-muted)',
        paper: 'var(--neo-paper)',
        ink: 'var(--neo-ink)',
        surface: 'var(--neo-surface)',
        muted: 'var(--neo-muted)',
        'muted-ink': 'var(--neo-muted-ink)',
        line: 'var(--neo-line)',
        hover: 'var(--neo-hover)',
        success: 'var(--neo-success)',
        warning: 'var(--neo-warning)',
        error: 'var(--neo-error)',
        info: 'var(--neo-info)',
      },
      fontFamily: {
        display: 'var(--neo-font-display)',
        sans: 'var(--neo-font-sans)',
        mono: 'var(--neo-font-mono)',
      },
      borderRadius: {
        neo: 'var(--neo-radius)',
      },
    },
  },
  plugins: [],
} satisfies Config;
