import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART } from '../lib/chartColors';
import { forecastHowMany, forecastWhen, type ForecastResult } from '../performance/montecarlo';

const axis = { fill: CHART.axis, fontSize: 11 };
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-main)' };

function futureDate(weeks: number): string {
  return new Date(Date.now() + weeks * 7 * 86_400_000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function Stat({ conf, value, suffix, hint, highlight }: { conf: string; value: number; suffix: string; hint?: string; highlight?: boolean }) {
  return <div style={{
    flex: 1, minWidth: 96, padding: '0.7rem 0.85rem', borderRadius: 12,
    border: `1px solid ${highlight ? CHART.primary : 'var(--border-default)'}`,
    background: highlight ? `color-mix(in srgb, ${CHART.primary} 8%, transparent)` : 'var(--surface)',
  }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{conf}</div>
    <strong style={{ fontSize: 22, color: 'var(--text-main)' }}>{value}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}> {suffix}</span></strong>
    {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
  </div>;
}

// Barras coloridas até o P85 (faixa provável) e o restante esmaecido (cauda de risco).
function Histogram({ result, threshold, unit }: { result: ForecastResult; threshold: number; unit: string }) {
  if (result.histogram.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem histórico de vazão suficiente para simular.</p>;
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={[...result.histogram]} margin={{ top: 6, right: 8, bottom: 4, left: -12 }}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
    <XAxis dataKey="value" tick={axis} tickFormatter={(v: number) => `${v}${unit}`} />
    <YAxis tick={axis} allowDecimals={false} />
    <Tooltip contentStyle={tooltipStyle}
      content={({ payload }) => {
        const p = payload?.[0]?.payload as { value: number; count: number; cumulative: number } | undefined;
        if (!p) return null;
        return <div style={{ ...tooltipStyle, padding: '8px 10px', fontSize: 12 }}>
          <strong>{p.value}{unit}</strong> · {p.count} de {result.trials} simulações
          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{p.cumulative}% acumulado</div>
        </div>;
      }} />
    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
      {result.histogram.map(b => <Cell key={b.value} fill={b.value <= threshold ? CHART.primary : CHART.neutral} fillOpacity={b.value <= threshold ? 0.85 : 0.4} />)}
    </Bar>
  </BarChart></ResponsiveContainer>;
}

const inputStyle: React.CSSProperties = {
  width: 84, padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--surface)', color: 'var(--text-main)', fontSize: 15, fontWeight: 600,
};

export function ForecastPanel({ weekly, backlog }: { weekly: number[]; backlog: number }) {
  const [items, setItems] = useState(Math.max(1, backlog));
  const [weeks, setWeeks] = useState(8);
  const when = useMemo(() => forecastWhen(weekly, items), [weekly, items]);
  const many = useMemo(() => forecastHowMany(weekly, weeks), [weekly, weeks]);
  const noData = weekly.length === 0 || weekly.every(w => w <= 0);

  if (noData) return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '1rem' }}>Sem histórico de entregas suficiente no período para simular. Aumente o intervalo de semanas.</p>;

  return <div style={{ display: 'grid', gap: 20 }}>
    {/* Amostra pequena não vira previsão. Monte Carlo REAMOSTRA as semanas observadas: com 3
        semanas ele reproduz 3 valores com aparência de confiança estatística e nenhuma
        informação sobre variabilidade real. O número era exibido igual, sem ressalva. */}
    {!when.sufficientSample && (
      <p role="status" style={{ margin: 0, padding: '0.6rem 0.75rem', fontSize: 12.5, lineHeight: 1.4, borderRadius: 6, background: 'var(--warn-surface, #3a2d10)', color: 'var(--warn-text, #f5d68a)' }}>
        <strong>Amostra insuficiente</strong> — {when.sampleSize} semana(s) de histórico.
        Os percentis abaixo são ilustrativos, não previsão: com esta quantidade de dados a
        simulação apenas repete o pouco que observou. Aumente o intervalo de semanas.
      </p>
    )}
    {/* ── Quando entregamos N itens? ── */}
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>Quando entregaremos</h3>
        <input type="number" min={1} value={items} onChange={e => setItems(Math.max(1, Number(e.target.value) || 0))} style={inputStyle} aria-label="Quantidade de itens" />
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>itens?</span>
        <button onClick={() => setItems(Math.max(1, backlog))} style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}>
          usar backlog atual ({backlog})
        </button>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        Simulação de {when.trials.toLocaleString('pt-BR')} cenários reamostrando a vazão semanal. <strong style={{ color: 'var(--text-main)' }}>85% de chance de concluir em até {when.p85} semanas</strong> — por volta de {futureDate(when.p85)}.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat conf="50% provável" value={when.p50} suffix="sem" hint={`~${futureDate(when.p50)}`} />
        <Stat conf="85% confiança" value={when.p85} suffix="sem" hint={`~${futureDate(when.p85)}`} highlight />
        <Stat conf="95% confiança" value={when.p95} suffix="sem" hint={`~${futureDate(when.p95)}`} />
      </div>
      <div style={{ height: 180 }}><Histogram result={when} threshold={when.p85} unit="s" /></div>
    </section>

    {/* ── Quantos itens em D semanas? ── */}
    <section style={{ borderTop: '1px solid var(--border-default)', paddingTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>Quantos itens entregaremos em</h3>
        <input type="number" min={1} max={52} value={weeks} onChange={e => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 0)))} style={inputStyle} aria-label="Número de semanas" />
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>semanas?</span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text-main)' }}>85% de chance de entregar ao menos {many.p85} itens</strong> nesse período (a mediana é {many.p50}).
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat conf="95% confiança" value={many.p95} suffix="itens" hint="ao menos" />
        <Stat conf="85% confiança" value={many.p85} suffix="itens" hint="ao menos" highlight />
        <Stat conf="50% provável" value={many.p50} suffix="itens" hint="ao menos" />
      </div>
      <div style={{ height: 180 }}><Histogram result={many} threshold={many.p50} unit="" /></div>
    </section>
  </div>;
}
