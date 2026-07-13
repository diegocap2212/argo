import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Hub NEO: página de login única (Magic Link). O Portal MMA não tem tela de login própria.
const HUB_URL = (import.meta.env.VITE_HUB_URL as string | undefined) || "https://neo-lm.vercel.app";

/**
 * Consome a sessão passada pelo hub no fragment da URL (#neo_at=…&neo_rt=…) e a aplica.
 * Hub e Portal são origens distintas (localStorage não é compartilhado). Limpa o fragment depois.
 */
async function consumeNeoSession(): Promise<void> {
  const hash = window.location.hash;
  if (!hash.includes("neo_at=")) return;
  const p = new URLSearchParams(hash.slice(1));
  const access_token = p.get("neo_at");
  const refresh_token = p.get("neo_rt");
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAnonymous: boolean;
  /** Autorizado pela allowlist do NEO (@lmmobilidade.com.br ou exceção aprovada). */
  allowed: boolean;
  signOut: () => Promise<void>;
  redirectToHub: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Domínio corporativo entra direto; exceções são resolvidas pelo RPC is_neo_allowed.
    const checkAllowed = async (s: Session | null) => {
      if (!s) { if (mounted) setAllowed(false); return; }
      const email = (s.user.email ?? "").toLowerCase();
      if (email.endsWith("@lmmobilidade.com.br")) { if (mounted) setAllowed(true); return; }
      const { data, error } = await supabase.rpc("is_neo_allowed");
      if (mounted) setAllowed(!error && data === true);
    };

    // Aplica a sessão vinda do hub (fragment) antes de ler a sessão persistida.
    consumeNeoSession().then(() => supabase.auth.getSession()).then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await checkAllowed(data.session);
      if (mounted) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      void checkAllowed(newSession);
    });

    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);

  const redirectToHub = () => { window.location.href = HUB_URL; };

  const signOut = async () => {
    await supabase.auth.signOut();
    redirectToHub();
  };

  const user = session?.user ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAnonymous: user?.is_anonymous ?? false,
        allowed,
        signOut,
        redirectToHub,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
