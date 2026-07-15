import { Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMySquads } from "@/hooks/useMySquads";
import { useIsPortalAdmin } from "@/hooks/useIsPortalAdmin";

function Interstitial({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
      <div className="h-9 w-9 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      <span className="text-sm tracking-wide">{message}</span>
    </div>
  );
}

/**
 * Autenticação vive no hub NEO. Sem sessão → volta ao hub (não há tela de login aqui).
 * Sessão sem autorização (fora da allowlist) → encerra e volta ao hub.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, allowed, redirectToHub, signOut } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) redirectToHub();
    else if (!allowed) void signOut();
  }, [loading, user, allowed, redirectToHub, signOut]);

  if (loading) return <Interstitial message="Verificando acesso…" />;
  if (!user) return <Interstitial message="Redirecionando para o NEO…" />;
  if (!allowed) return <Interstitial message="Este acesso não está autorizado…" />;

  return <>{children}</>;
}

/**
 * Gate do /admin: admin global do portal OU gestor (SM/AM) de pelo menos um squad.
 * O que cada um vê/gerencia lá dentro é decidido pela RLS + pelo modo da tela.
 */
export function RequireManager({ children }: { children: React.ReactNode }) {
  const { data: squads, isLoading } = useMySquads();
  const { data: isAdmin, isLoading: adminLoading } = useIsPortalAdmin();

  if (isLoading || adminLoading) return null;

  const isManagerAnywhere = (squads ?? []).some((s) => s.roles.includes("am") || s.roles.includes("sm"));
  if (!isAdmin && !isManagerAnywhere) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
