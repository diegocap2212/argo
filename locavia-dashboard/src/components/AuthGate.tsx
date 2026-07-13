import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { consumeNeoSession, hasSession, redirectToHub } from '../services/authService';

type GateState = 'loading' | 'authed' | 'redirecting';

// Origem confiável do Portal MMA, que embute o Dash em iframe e repassa a sessão via postMessage.
const MMA_ORIGIN = (import.meta.env.VITE_MMA_ORIGIN as string | undefined) || 'https://maturitymodel-ashen.vercel.app';

const isEmbedded = () => new URLSearchParams(window.location.search).get('embed') === '1';

/**
 * A autenticação do NEO acontece no hub. Este gate:
 *  - libera direto em dev/local (sem Supabase configurado);
 *  - reusa a sessão do Supabase (localStorage) quando existe;
 *  - sem sessão e fora de iframe → manda ao hub (não há tela de login própria);
 *  - dentro de iframe (?embed=1, Portal MMA) → recebe a sessão do pai via postMessage.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let mounted = true;
    const embedded = isEmbedded();

    // No modo embed, o Portal MMA envia a sessão do usuário. Aplicamos com setSession.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== MMA_ORIGIN) return;
      const data = event.data;
      if (data?.type !== 'neo:session' || !data.access_token || !data.refresh_token) return;
      void supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
    };
    if (embedded && supabaseConfigured) {
      window.addEventListener('message', onMessage);
      // Avisa o pai que o iframe está pronto para receber a sessão.
      window.parent?.postMessage({ type: 'neo:ready' }, MMA_ORIGIN);
    }

    const resolve = async () => {
      // Aplica a sessão vinda do hub (fragment), se houver, antes de decidir.
      await consumeNeoSession();
      if (await hasSession()) {
        if (mounted) setState('authed');
        return;
      }
      // Sem sessão: no iframe aguardamos o postMessage; fora dele, vamos ao hub.
      if (!embedded) {
        if (mounted) setState('redirecting');
        redirectToHub();
      }
    };

    void resolve();

    // Só o resolve() decide o redirect inicial (após consumir o handoff). Aqui reagimos apenas
    // a transições explícitas: login (SIGNED_IN) libera; logout (SIGNED_OUT) volta ao hub.
    // NÃO redirecionar no INITIAL_SESSION null — ele dispara antes do handoff e redirecionava cedo demais.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session) setState('authed');
      else if (event === 'SIGNED_OUT' && !embedded) { setState('redirecting'); redirectToHub(); }
    });

    return () => {
      mounted = false;
      window.removeEventListener('message', onMessage);
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
