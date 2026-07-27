import { DAMA_AREAS, DAMA_AREA_SHORT, type DamaArea } from "@/lib/state/dama";

/**
 * Radar de maturidade DAMA — SVG puro, server component (sem "use client").
 * Renderiza no servidor de propósito: sai na exportação PDF via CSS print,
 * onde libs de chart client-side falhariam. 11 eixos (Roda DAMA), escala 1–5.
 * Polígono preenchido = nível atual; tracejado dourado = meta.
 */

export type RadarPoint = {
  area: string;
  nivelAtual: number | null;
  nivelMeta: number | null;
};

const SIZE = 340;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 110; // raio do nível 5
const LEVELS = [1, 2, 3, 4, 5];

function polar(index: number, total: number, value: number): [number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  const r = (value / 5) * R;
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}

function polygonPoints(values: (number | null)[], total: number): string {
  return values
    .map((v, i) => polar(i, total, v ?? 0))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

export function DamaRadar({ points }: { points: RadarPoint[] }) {
  // Ordena pelos eixos canônicos da Roda DAMA; áreas sem avaliação entram como 0.
  const byArea = new Map(points.map((p) => [p.area, p]));
  const areas = [...DAMA_AREAS];
  const atual = areas.map((a) => byArea.get(a)?.nivelAtual ?? null);
  const meta = areas.map((a) => byArea.get(a)?.nivelMeta ?? null);
  const n = areas.length;

  const temAtual = atual.some((v) => v !== null);
  const temMeta = meta.some((v) => v !== null);

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-sm"
        role="img"
        aria-label="Radar de maturidade DAMA: nível atual vs. meta por área"
      >
        {/* Grid: anéis 1–5 */}
        {LEVELS.map((lvl) => (
          <polygon
            key={lvl}
            points={polygonPoints(areas.map(() => lvl), n)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={lvl === 3 ? 1.5 : 0.75}
          />
        ))}
        {/* Eixos */}
        {areas.map((_, i) => {
          const [x, y] = polar(i, n, 5);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="var(--border)"
              strokeWidth={0.75}
            />
          );
        })}
        {/* Meta (tracejado dourado) */}
        {temMeta && (
          <polygon
            points={polygonPoints(meta, n)}
            fill="none"
            stroke="var(--brand-gold)"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}
        {/* Atual (preenchido) */}
        {temAtual && (
          <polygon
            points={polygonPoints(atual, n)}
            fill="var(--brand)"
            fillOpacity={0.18}
            stroke="var(--brand)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {/* Pontos do nível atual */}
        {temAtual &&
          atual.map((v, i) => {
            if (v === null) return null;
            const [x, y] = polar(i, n, v);
            return <circle key={i} cx={x} cy={y} r={3} fill="var(--brand)" />;
          })}
        {/* Labels dos eixos */}
        {areas.map((area, i) => {
          const [x, y] = polar(i, n, 6.15);
          const cos = Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n);
          const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
          return (
            <text
              key={area}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={9.5}
            >
              {DAMA_AREA_SHORT[area as DamaArea] ?? area}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: "var(--brand)", opacity: 0.7 }}
          />
          Nível atual
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--brand-gold) 0 6px, transparent 6px 10px)",
            }}
          />
          Meta
        </span>
        <span>Escala 1–5 (Inicial → Otimizado)</span>
      </figcaption>
    </figure>
  );
}
