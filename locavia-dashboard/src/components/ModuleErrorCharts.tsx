import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CATEGORICAL, CATEGORICAL_OUTROS } from '../lib/chartColors';
import { foldSlices, type Slice } from '../performance/moduleErrors';

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-main)' };

function colorFor(name: string, index: number): string {
  return name === 'Outros' ? CATEGORICAL_OUTROS : CATEGORICAL[index % CATEGORICAL.length];
}

/**
 * Donut de identidade (Jornada/Status) com legenda + contagens.
 * A soma das fatias pode exceder o total central quando itens têm >1 jornada.
 */
export function DonutBreakdown({
  slices, centerValue, centerLabel,
}: { slices: readonly Slice[]; centerValue: number; centerLabel: string }) {
  const data = foldSlices(slices).map((s, i) => ({ ...s, fill: colorFor(s.name, i) }));
  const sum = data.reduce((acc, d) => acc + d.value, 0) || 1;

  if (data.length === 0) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Sem itens para os filtros selecionados.
    </div>;
  }

  return <div style={{ display: 'flex', gap: 16, height: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
    <div style={{ position: 'relative', flex: '0 0 170px', height: 170 }}>
      <ResponsiveContainer width="100%" height="100%"><PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
          {data.map(d => <Cell key={d.name} fill={d.fill} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle}
          content={({ payload }) => {
            const p = payload?.[0];
            if (!p) return null;
            const v = p.value as number;
            return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>
              {p.name}: <strong>{v}</strong> · {Math.round((v / sum) * 100)}%
            </div>;
          }} />
      </PieChart></ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center' }}>
          <strong style={{ fontSize: 28, color: 'var(--text-main)' }}>{centerValue}</strong>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{centerLabel}</div>
        </div>
      </div>
    </div>
    {/* Legenda com contagens = relevo de identidade (não depende só de cor). */}
    <ul style={{ flex: 1, minWidth: 160, listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map(d => (
        <li key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-main)' }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: d.fill, flexShrink: 0 }} />
          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{d.name}</span>
          <strong>{d.value}</strong>
          <span style={{ color: 'var(--text-muted)', width: 38, textAlign: 'right' }}>{Math.round((d.value / sum) * 100)}%</span>
        </li>
      ))}
    </ul>
  </div>;
}
