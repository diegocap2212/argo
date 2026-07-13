import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMySquads } from "@/hooks/useMySquads";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/** Só deixa passar quem é AM de pelo menos um squad — usa a mesma query da sidebar (cache compartilhado). */
export function RequireAM({ children }: { children: React.ReactNode }) {
  const { data: squads, isLoading } = useMySquads();

  if (isLoading) return null;

  const isAMAnywhere = (squads ?? []).some((s) => s.roles.includes("am"));
  if (!isAMAnywhere) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
