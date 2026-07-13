import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { checkSession } from '../services/authService';
import { LoginScreen } from './LoginScreen';

type GateState = 'loading' | 'authed' | 'login';

/**
 * Envolve o app: checa a sessão e exibe a tela de login quando o gate está ativo
 * (envs SESSION_SECRET/DASHBOARD_PASSWORD setadas na Vercel) e o usuário não está autenticado.
 * Em dev/local (sem o endpoint ou gate desativado), libera direto.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let mounted = true;
    checkSession().then(({ authenticated }) => {
      if (mounted) setState(authenticated ? 'authed' : 'login');
    });
    return () => { mounted = false; };
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page)' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--accent-strong)' }} />
      </div>
    );
  }

  if (state === 'login') {
    return <LoginScreen onSuccess={() => setState('authed')} />;
  }

  return <>{children}</>;
};
