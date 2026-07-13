import React, { useState } from 'react';
import { login } from '../services/authService';
import Button from './ui/Button';
import { Input } from './ui/Input';

interface Props {
  onSuccess: () => void;
}

export const LoginScreen: React.FC<Props> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const r = await login(password);
    setBusy(false);
    if (r.ok) {
      onSuccess();
    } else {
      setError(r.error || 'Não foi possível entrar.');
      setPassword('');
    }
  };

  return (
    // O login é SEMPRE escuro (padrão fixo), independente do tema do app: data-theme="dark"
    // força os tokens em escuro e o "V" de vidro (hard-light sobre #000) brilha. O claro/escuro
    // do app vale só nas páginas internas.
    <div
      data-theme="dark"
      style={{
        minHeight: '100vh', display: 'flex', background: '#000',
        color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── Lado do formulário ── */}
      <div style={{ flex: '0 1 520px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3rem clamp(2rem, 5vw, 4.5rem)' }}>
        <img
          src="/venice-by-blite.svg"
          alt="Venice by blite"
          style={{ width: 150, marginBottom: '2.75rem', filter: 'brightness(0) invert(1)' }}
        />

        <h1 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-serif)', fontSize: '3rem', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
          Bem-vindo(a)
        </h1>
        <p style={{ margin: '0 0 2rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Digite sua senha para acessar o dashboard
        </p>

        <form onSubmit={submit}>
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            error={error || undefined}
          />

          <Button
            type="submit"
            variant="accent"
            loading={busy}
            disabled={!password}
            style={{ marginTop: '1.25rem', width: '100%', boxShadow: '0 8px 28px rgba(43,232,107,0.35)' }}
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p style={{ margin: '1.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Acesso protegido. Em caso de dúvida, fale com o time Venice.
        </p>
      </div>

      {/* ── Lado hero (marca Venice) — "V" de vidro sobre PRETO ──
         O render do "V" é composto com blend HARD_LIGHT, que apaga o backdrop do render e
         mantém só o vidro brilhando sobre o preto. Enquadramento em % relativas ao painel. */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden', background: '#000',
        isolation: 'isolate',
      }}>
        <img
          src="/venice-v-glass.png"
          alt="Venice"
          style={{
            position: 'absolute', top: '-20%', left: '-6.2%',
            width: '140.8%', height: '151.1%', objectFit: 'fill',
            mixBlendMode: 'hard-light',
            pointerEvents: 'none', userSelect: 'none',
          }}
        />
      </div>
    </div>
  );
};
