import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchData } from '../services/dataService';
import type { DashboardItem } from '../types/jira';
import {
  computeModuleErrorView, listJornadas, listModulos,
} from '../performance/moduleErrors';
import { DashboardChartCard } from '../components/PerformanceCharts';
import { DonutBreakdown } from '../components/ModuleErrorCharts';
import '../styles/redesign.css';

const DEFAULT_MODULO = 'Erro de processo';
const TODAS = '';

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem', borderRadius: 10, border: '1px solid var(--border-default)',
  background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.85rem', minWidth: 200,
};

export default function ModuleErrors() {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modulo, setModulo] = useState(DEFAULT_MODULO);
  const [jornada, setJornada] = useState(TODAS);

  useEffect(() => {
    let alive = true;
    fetchData()
      .then(data => { if (alive) setItems(data as unknown as DashboardItem[]); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const modulos = useMemo(() => listModulos(items), [items]);
  // Clampa no render (sem efeito): se o módulo escolhido não existe no dataset,
  // usa o mais frequente; idem para a jornada fora do módulo atual.
  const effectiveModulo = modulos.some(m => m.name === modulo) ? modulo : (modulos[0]?.name ?? modulo);
  const jornadas = useMemo(() => listJornadas(items, effectiveModulo), [items, effectiveModulo]);
  const effectiveJornada = !jornada || jornadas.includes(jornada) ? jornada : TODAS;

  const view = useMemo(
    () => computeModuleErrorView(items, { modulo: effectiveModulo, jornada: effectiveJornada }),
    [items, effectiveModulo, effectiveJornada],
  );

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <RefreshCw className="animate-spin" size={28} color="var(--primary)" />
    </div>;
  }
  if (error) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--danger, #E5484D)' }}>Erro ao carregar dados: {error}</div>;
  }

  return <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    <header>
      <h1 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>Scripts Manuais por Módulo</h1>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Itens do tipo <strong>Script Manual</strong> distribuídos por Jornada e Status, filtráveis por Módulo.
      </p>
    </header>

    {/* Filtros numa linha só, acima dos gráficos (spec dataviz). */}
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Módulo
        <select value={effectiveModulo} onChange={e => setModulo(e.target.value)} style={selectStyle}>
          {modulos.map(m => <option key={m.name} value={m.name}>{m.name} ({m.value})</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Jornada
        <select value={effectiveJornada} onChange={e => setJornada(e.target.value)} style={selectStyle}>
          <option value={TODAS}>Todas as jornadas</option>
          {jornadas.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </label>
      <div className="premium-card" style={{ padding: '0.6rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'auto' }}>
        <strong style={{ fontSize: 26, color: 'var(--text-main)', lineHeight: 1 }}>{view.total}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Scripts Manuais no filtro</span>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
      <DashboardChartCard title={`${effectiveModulo || 'Todos os módulos'} × Jornada`}
        subtitle={view.multiJornada ? 'Um item pode ter mais de uma jornada — a soma das fatias excede o total.' : 'Distribuição por jornada de negócio.'}
        height={280}>
        <DonutBreakdown slices={view.byJornada} centerValue={view.total} centerLabel="itens" />
      </DashboardChartCard>

      <DashboardChartCard title={`${effectiveModulo || 'Todos os módulos'} × Status`}
        subtitle="Distribuição por status atual no Jira." height={280}>
        <DonutBreakdown slices={view.byStatus} centerValue={view.total} centerLabel="itens" />
      </DashboardChartCard>
    </div>
  </div>;
}
