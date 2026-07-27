import { Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalRole } from "@/hooks/usePortalRole";

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
 * Gate do /admin: SÓ admin global do portal.
 *
 * Antes era "admin OU gestor (SM/AM) de algum squad", porque SM/AM gerenciavam os
 * membros do próprio squad. Desde 2026-07-26 estrutura da organização (quem existe, quem
 * está em qual squad, quem tem papel global) é ação de admin — e o AM é GLOBAL, então
 * "gerenciar o próprio squad" passaria a significar gerenciar todos. Deixar a tela
 * acessível a quem a RLS recusa é pior que não mostrá-la: o formulário só falha no envio.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = usePortalRole();

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
