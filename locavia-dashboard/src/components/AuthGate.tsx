import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { hasSession, redirectToHub } from '../services/authService';

type GateState = 'loading' | 'authed' | 'redirecting';

/**
 * A autenticação do NEO acontece no hub (raiz da mesma origem). Este gate:
 *  - libera direto em dev/local (sem Supabase configurado);
 *  - reusa a sessão do Supabase (localStorage compartilhado da origem) quando existe —
 *    inclusive dentro do iframe ?embed=1 do Portal MMA (same-origin, sem postMessage);
 *  - sem sessão → manda ao hub (não há tela de login própria).
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let mounted = true;

    const resolve = async () => {
      if (await hasSession()) {
        if (mounted) setState('authed');
        return;
      }
      if (mounted) setState('redirecting');
      redirectToHub();
    };

    void resolve();

    // Reagimos apenas a transições explícitas: login (SIGNED_IN) libera; logout (SIGNED_OUT)
    // volta ao hub. NÃO redirecionar no INITIAL_SESSION null — o resolve() já decide o boot.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session) setState('authed');
      else if (event === 'SIGNED_OUT') { setState('redirecting'); redirectToHub(); }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === 'authed') return <>{children}</>;

  const message = state === 'redirecting' ? 'Redirecionando para o NEO…' : 'Autenticando…';
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--page)' }}>
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--accent-strong)' }} />
      <span style={{ color: 'var(--muted)', fontSize: 13, letterSpacing: '0.02em' }}>{message}</span>
    </div>
  );
};
