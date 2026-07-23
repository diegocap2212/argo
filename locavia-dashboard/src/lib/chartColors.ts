/**
 * Paleta central dos gráficos — Design System Venice (by blite).
 * Verde neon como assinatura; séries em tons de verde/forest/sage + neutro.
 * Mantém a semântica de feedback (vermelho = risco/bug, âmbar = andamento).
 *
 * grid/axis usam cinza translúcido neutro → legível tanto em cards claros
 * (light) quanto escuros (dark), sem precisar thre+ar o tema em cada chart.
 */
export const CHART = {
  primary: '#1FD75F', // série principal — verde Venice
  violet: '#8A38F5',  // segunda série comparativa (charter MMA)
  success: '#34D399', // feedback semântico; não confundir com accent
  forest: '#58855C',  // série de apoio escura
  sage: '#9EB8A0',    // série de apoio clara (ex.: Spike, antes violeta)
  mint: '#5FE389',    // entregue/concluído/sucesso — verde claro
  amber: '#E8A317',   // em andamento/aviso
  red: '#E5484D',     // bug/risco
  neutral: '#82928A', // série neutra/criadas
  grid: 'rgba(130,146,138,0.22)', // grade (neutro translúcido)
  axis: 'rgba(130,146,138,0.85)', // ticks dos eixos
} as const;

/** Cores por tipo de item (usado em Vazão e no donut de entrega por tipo). */
export const TYPE_COLORS: Record<string, string> = {
  'História': '#15803A', // verde escuro
  'Bug': CHART.red,
  'Tarefa': '#5FE389',   // verde claro
  'Spike': CHART.sage,   // sage (antes violeta)
  'Outros': CHART.neutral,
};

/**
 * Ordem categórica para fatias de identidade (donuts por Jornada/Status/Módulo).
 * Validada pelo script do skill dataviz (CVD/normal-vision PASS em light).
 * Atribuir SEMPRE nesta ordem fixa; o 6º+ item vira "Outros" (neutro).
 */
export const CATEGORICAL = ['#1FD75F', '#8A38F5', '#E8A317', '#E5484D', '#12A594'] as const;
export const CATEGORICAL_OUTROS = CHART.neutral; // cinza deliberado para o balde "Outros"

// ── Tema ESCURO branded para o card de destaque (CFD) ──
export const CHART_DARK = {
  bg: '#0A1F12',
  surface: 'linear-gradient(180deg, #11281A 0%, #0A1F12 100%)',
  grid: 'rgba(255,255,255,0.08)',
  axis: 'rgba(255,255,255,0.55)',
  text: 'rgba(255,255,255,0.92)',
  textMuted: 'rgba(255,255,255,0.55)',
  // bandas vivas sobre o fundo escuro
  done: '#2BE86B',   // concluído (verde neon)
  wip: '#F0C66B',    // em andamento (âmbar)
  todo: '#9EB8A0',   // a fazer (sage)
} as const;
