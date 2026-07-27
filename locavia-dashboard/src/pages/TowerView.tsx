import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { SM_CONFIGS } from '../config/sm-config';
import { usePerformancePortfolio } from '../hooks/usePerformancePortfolio';
import { computeSMComparison } from '../performance/smComparison';
import { TowerComparison } from '../components/TowerComparison';
import { authHeaders } from '../services/authService';
import '../styles/redesign.css';

const PERIODS = [4, 8, 12, 16, 24];

type GateState = 'checking' | 'locked' | 'open';

/**
 * Visão restrita "Torre": comparativo entre agilistas (SM × SM e time × time).
 * A senha é validada server-side em /api/gate?scope=tower (env TOWER_PASSWORD) e vira o
 * cookie HttpOnly neo_tower de 12h — nada de segredo no bundle. Sem a env configurada
 * (dev), abre direto. O mesmo endpoint atende ?scope=nero (a porta 03 do portal).
 */
const GATE_URL = '/api/gate?scope=tower';
export default function TowerView() {
  const [gate, setGate] = useState<GateState>('checking');
  const [password, setPassword] = useState('');
  const [gateError, setGateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [weeks, setWeeks] = useState(8);

  useEffect(() => {
    fetch(GATE_URL)
      .then(r => setGate(r.ok ? 'open' : 'locked'))
      .catch(() => setGate('locked'));
  }, []);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setGateError('');
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const r = await fetch(GATE_URL, { method: 'POST', headers, body: JSON.stringify({ password }) });
      if (r.ok) setGate('open');
      else setGateError(r.status === 403 ? 'Senha incorreta.' : 'Não foi possível validar agora. Tente de novo.');
    } catch {
      setGateError('Não foi possível validar agora. Tente de novo.');
    } finally {
      setSubmitting(false);
      setPassword('');
    }
  };

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
                <p>O comparativo entre agilistas é protegido por senha.</p>
              </div>
            </div>
          </section>
          {gate === 'checking' ? (
            <div className="rd-state">Verificando acesso…</div>
          ) : (
            <form onSubmit={unlock} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              <input
                type="password"
                className="rd-select"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Senha da torre"
                aria-label="Senha da torre"
                autoFocus
              />
              <button type="submit" className="btn-dark" disabled={submitting || !password}>
                {submitting ? 'Validando…' : 'Entrar na torre'}
              </button>
              {gateError && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{gateError}</p>}
            </form>
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
