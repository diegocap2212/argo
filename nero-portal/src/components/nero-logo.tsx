/**
 * Logo do Nero — perfil de moeda romana (SVG inline).
 * Baseado nos retratos históricos do Imperador Nero: busto de perfil
 * voltado à direita, com coroa de louros e anel de ouro de moeda imperial.
 * Sem dependências externas — puro SVG.
 */

export function NeroLogo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Nero"
      style={{ display: "block" }}
    >
      <defs>
        {/* Fundo da moeda: esmeralda profunda — família do accent NEO (#2BE86B) */}
        <radialGradient id="nero-coin-bg" cx="44%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#159a52" />
          <stop offset="100%" stopColor="#052e1a" />
        </radialGradient>
        {/* Brilho dourado para o anel */}
        <linearGradient id="nero-gold-ring" x1="20%" y1="20%" x2="80%" y2="80%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>

      {/* ── Disco da moeda ── */}
      <circle cx="50" cy="50" r="48" fill="url(#nero-coin-bg)" />

      {/* Anel externo dourado (borda de moeda) */}
      <circle cx="50" cy="50" r="47.5" fill="none" stroke="url(#nero-gold-ring)" strokeWidth="3.5" />
      {/* Anel interno fino (detalhe de cunhagem) */}
      <circle cx="50" cy="50" r="43.5" fill="none" stroke="#d97706" strokeWidth="0.7" opacity="0.55" />

      {/* ── Silhueta do busto — perfil voltado à direita ──
           Traçado baseado nos bustos e moedas históricas de Nero:
           testa alta, nariz aquilino, lábios cheios, queixo pronunciado, pescoço curto.
      */}
      <path
        d="
          M 32,91
          C 32,83 31,77 31,72
          C 31,68 33,64 35,59
          C 37,54 35,48 35,42
          C 35,35 38,29 42,25
          C 46,21 52,18 59,18
          C 65,18 71,21 74,27
          C 76,31 76,36 74,41
          C 72,41 70,42 72,48
          C 74,52 74,56 72,59
          C 71,61 73,64 71,67
          C 69,70 65,73 62,75
          C 59,77 58,81 58,85
          C 58,88 60,91 62,91
          Z
        "
        fill="#fff8e6"
        opacity="0.93"
      />

      {/* ── Coroa de louros ──
           Cinco folhas elípticas estilizadas ao longo do topo da cabeça,
           do occipital ao frontal, na cor dourada-âmbar.
      */}
      <g fill="#d97706" opacity="0.95">
        <ellipse cx="43" cy="24" rx="5.5" ry="2.2" transform="rotate(-38 43 24)" />
        <ellipse cx="49" cy="19" rx="5.5" ry="2.2" transform="rotate(-20 49 19)" />
        <ellipse cx="56" cy="17" rx="5.5" ry="2.2" transform="rotate(-3 56 17)" />
        <ellipse cx="63" cy="19" rx="5.5" ry="2.2" transform="rotate(15 63 19)" />
        <ellipse cx="69" cy="24" rx="5.5" ry="2.2" transform="rotate(31 69 24)" />
      </g>
    </svg>
  );
}
