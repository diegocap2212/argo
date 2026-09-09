import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Portal NEO de origem única: o hub (login Magic Link) vive em `/` na mesma origem — a sessão
// Supabase é compartilhada pelo localStorage. O Portal MMA não tem tela de login própria.

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAnonymous: boolean;
  /** Autorizado pela allowlist do NEO (aprovado em `neo_access`). */
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

    // Quem entra é quem está na allowlist — o RPC is_neo_allowed é a única resposta.
    const checkAllowed = async (s: Session | null) => {
      if (!s) { if (mounted) setAllowed(false); return; }
      const { data, error } = await supabase.rpc("is_neo_allowed");
      if (mounted) setAllowed(!error && data === true);
    };

    // Sessão persistida no localStorage da origem (o hub em `/` fez o login).
    supabase.auth.getSession().then(async ({ data }) => {
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

  const redirectToHub = () => { window.location.href = "/"; };

  const signOut = async () => {
    // Encerra a sessão NEO (cookie do middleware) além da sessão Supabase.
    await fetch("/api/session", { method: "DELETE" }).catch(() => {});
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
