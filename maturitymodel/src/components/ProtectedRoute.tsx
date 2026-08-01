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
 * Gate de rota administrativa DENTRO do MMA.
 *
 * ⚠️ SEM USO desde 31/07/2026: a administração saiu deste app e virou o `/admin` do NEO, cuja
 * porta é guardada pela borda (`neo.admin.access`) e pela RLS. Ficou aqui, e não foi apagado,
 * porque a regra que ele carrega — **nunca renderizar tela que a RLS vai recusar, porque o
 * formulário só falha no envio** — continua valendo para a próxima rota restrita que este app
 * criar. Se a próxima não vier, apague: guarda sem guardado é ruído.
 *
 * Histórico: antes de 2026-07-26 era "admin OU gestor (SM/AM) de algum squad". Com o AM virando
 * GLOBAL, "gerenciar o próprio squad" passaria a significar gerenciar todos.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = usePortalRole();

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
