import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute, RequireAM } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";

const Login = lazy(() => import("@/pages/Login"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Inicio = lazy(() => import("@/pages/Inicio"));
const Torre = lazy(() => import("@/pages/Torre"));
const Guia = lazy(() => import("@/pages/Guia"));
const AdminMMA = lazy(() => import("@/pages/AdminMMA"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Jornada = lazy(() => import("@/pages/squad/Jornada"));
const Sessao = lazy(() => import("@/pages/squad/Sessao"));
const Homologacao = lazy(() => import("@/pages/squad/Homologacao"));
const Plano = lazy(() => import("@/pages/squad/Plano"));
const Metricas = lazy(() => import("@/pages/squad/Metricas"));
const Comparativo = lazy(() => import("@/pages/squad/Comparativo"));
const Apresentar = lazy(() => import("@/pages/squad/Apresentar"));

const queryClient = new QueryClient();

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-venice-textTertiary">
      Carregando…
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

/** Redireciona /team/:teamId/... (rota legada) para o equivalente /s/:teamId/... */
function TeamRedirect({ suffix = "" }: { suffix?: string }) {
  const { teamId } = useParams<{ teamId: string }>();
  return <Navigate to={`/s/${teamId}${suffix}`} replace />;
}

/**
 * Captura o fluxo de convite/recuperação de senha e leva pra /reset-password —
 * independentemente de onde o link do email cair (Supabase redireciona pra
 * Site URL raiz por padrão). Cobre dois sinais: o evento PASSWORD_RECOVERY do
 * supabase-js e o `type=recovery|invite` no hash da URL no primeiro carregamento.
 */
function AuthRecoveryGate() {
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash;
    if (/type=(recovery|invite)/.test(hash) && window.location.pathname !== "/reset-password") {
      navigate("/reset-password", { replace: true });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthRecoveryGate />
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  <Route path="/" element={<Shell><Inicio /></Shell>} />
                  <Route path="/torre" element={<Shell><Torre /></Shell>} />
                  <Route path="/guia" element={<Shell><Guia /></Shell>} />
                  <Route
                    path="/admin"
                    element={
                      <Shell>
                        <RequireAM>
                          <AdminMMA />
                        </RequireAM>
                      </Shell>
                    }
                  />

                  <Route path="/s/:teamId" element={<Shell><Jornada /></Shell>} />
                  <Route path="/s/:teamId/sessao" element={<Shell><Sessao /></Shell>} />
                  <Route path="/s/:teamId/homologacao" element={<Shell><Homologacao /></Shell>} />
                  <Route path="/s/:teamId/plano" element={<Shell><Plano /></Shell>} />
                  <Route path="/s/:teamId/metricas" element={<Shell><Metricas /></Shell>} />
                  <Route path="/s/:teamId/comparativo" element={<Shell><Comparativo /></Shell>} />

                  {/* Apresentação é fullscreen — fora do AppShell, mas ainda protegida */}
                  <Route
                    path="/s/:teamId/apresentar"
                    element={
                      <ProtectedRoute>
                        <Apresentar />
                      </ProtectedRoute>
                    }
                  />

                  {/* Redirects legados (app antigo → Portal MMA) */}
                  <Route path="/auth" element={<Navigate to="/login" replace />} />
                  <Route path="/welcome" element={<Navigate to="/" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/torre" replace />} />
                  <Route path="/guide" element={<Navigate to="/guia" replace />} />
                  <Route path="/iceberg" element={<Navigate to="/guia" replace />} />
                  <Route path="/vector" element={<Navigate to="/guia" replace />} />
                  <Route path="/tutorial" element={<Navigate to="/guia" replace />} />

                  {/* Redirects de rotas antigas do ciclo → Sessão */}
                  <Route path="/s/:teamId/avaliar" element={<TeamRedirect suffix="/sessao" />} />
                  <Route path="/s/:teamId/workshop" element={<TeamRedirect suffix="/sessao" />} />

                  {/* Redirects legados dinâmicos (/team/:teamId/...) */}
                  <Route path="/team/:teamId" element={<TeamRedirect />} />
                  <Route path="/team/:teamId/assessment" element={<TeamRedirect suffix="/sessao" />} />
                  <Route path="/team/:teamId/assessment/:assessmentId" element={<TeamRedirect suffix="/sessao" />} />
                  <Route path="/team/:teamId/results/:assessmentId" element={<TeamRedirect />} />
                  <Route path="/team/:teamId/evolution-plan" element={<TeamRedirect suffix="/plano" />} />
                  <Route path="/team/:teamId/report" element={<TeamRedirect suffix="/comparativo" />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
