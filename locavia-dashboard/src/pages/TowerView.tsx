import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { SM_CONFIGS } from '../config/sm-config';
import { usePerformancePortfolio } from '../hooks/usePerformancePortfolio';
import { computeSMComparison } from '../performance/smComparison';
import { TowerComparison } from '../components/TowerComparison';
import { fetchData, getDatasetProvenance } from '../services/dataService';
import '../styles/redesign.css';

const PERIODS = [4, 8, 12, 16, 24];

type GateState = 'checking' | 'locked' | 'open';

/**
 * Visão restrita "Torre": comparativo entre agilistas (SM × SM e time × time).
 *
 * A SENHA SAIU em 31/07/2026. Quem decide agora é a permissão `dash.tower.view`, resolvida
 * server-side pelo `/api/data` com o JWT da pessoa e devolvida no campo `tower`. Ganho concreto
 * sobre a senha compartilhada: existe QUEM, revogar uma pessoa não obriga a trocar a senha de
 * todas, e sair da empresa tira o acesso.
 *
 * ⚠️ ISTO NÃO FECHA O VAZAMENTO, e fingir que fecha seria pior do que não mexer. O comparativo
 * é calculado AQUI, no cliente, a partir dos mesmos `items` que qualquer sessão baixa, cruzados
 * com `sm-config.ts` — que está no bundle e é usado também pelo App e pelo AppShell. Não há
 * campo a omitir do payload. Fechar de verdade exige `/api/data` devolver só os times que a
 * pessoa pode ver, o que muda o que o Dash mostra para todo mundo. Ver SECURITY.md §6.
 */
export default function TowerView() {
  const [gate, setGate] = useState<GateState>('checking');
  const [weeks, setWeeks] = useState(8);

  useEffect(() => {
    let alive = true;
    // `fetchData` é memoizado no dataService: isto não gera uma segunda ida à rede quando o
    // conteúdo montar e pedir os mesmos dados.
    fetchData()
      .then(() => {
        if (alive) setGate(getDatasetProvenance()?.tower ? 'open' : 'locked');
      })
      .catch(() => {
        if (alive) setGate('locked');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (gate !== 'open') {
    return (
      <div className="rd">
        <div className="rd-main" style={{ maxWidth: 520 }}>
          <section className="page-head" style={{ justifyContent: 'center' }}>
            <div className="ph-title">
              <span className="avatar" aria-hidden="true"><Lock size={20} /></span>
              <div>
                <span className="eyebrow">Acesso restrito</span>
                <h1>Torre</h1>
                <p>O comparativo entre agilistas depende de permissão.</p>
              </div>
            </div>
          </section>
          {gate === 'checking' ? (
            <div className="rd-state">Verificando acesso…</div>
          ) : (
            <p className="rd-state" style={{ marginTop: 24 }}>
              Você não tem a função <strong>Ver o comparativo entre agilistas (Torre)</strong>.
              Peça a um administrador do NEO — não há senha a digitar. Se acabou de receber, recarregue.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <TowerContent weeks={weeks} onWeeks={setWeeks} />;
}

/** Conteúdo da torre — só monta (e só busca dados) depois do gate abrir. */
function TowerContent({ weeks, onWeeks }: { weeks: number; onWeeks: (w: number) => void }) {
  const { items, period, portfolio, now, loading, error } = usePerformancePortfolio(weeks * 7);
  const comparison = useMemo(
    () => computeSMComparison(items, portfolio.teams, SM_CONFIGS, period, now),
    [items, portfolio.teams, period, now],
  );

  return (
    <div className="rd">
      <div className="rd-main">
        <section className="page-head">
          <div className="ph-title">
            <div>
              <span className="eyebrow">Visão restrita · Gestão</span>
              <h1>Torre</h1>
              <p>Comparativo consolidado dos portfólios por agilista — SM × SM e time × time.</p>
            </div>
          </div>
          <div className="head-actions">
            <select className="rd-select" value={weeks} onChange={e => onWeeks(Number(e.target.value))} aria-label="Período em semanas">
              {PERIODS.map(w => <option key={w} value={w}>Últimas {w} semanas</option>)}
            </select>
          </div>
        </section>
        {loading ? <div className="rd-state">Carregando comparativo…</div>
          : error ? <div className="rd-state" style={{ color: 'var(--red)' }}>{error}</div>
          : <TowerComparison comparison={comparison} />}
      </div>
    </div>
  );
}
