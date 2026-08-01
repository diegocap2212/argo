import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Sessão do Supabase, lida do localStorage da MESMA origem em que o hub logou.
 *
 * Este app não tem tela de login e não deve ter: quem entra em `/admin/` sem sessão foi
 * mandado para cá pela borda, que já devolve ao hub. Duas telas de login no mesmo portal são
 * dois lugares para o fluxo de OTP divergir.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
