import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";

const Inicio = lazy(() => import("@/pages/Inicio"));
const Torre = lazy(() => import("@/pages/Torre"));
const Guia = lazy(() => import("@/pages/Guia"));
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
 * `/maturity/admin` → `/admin`. O destino é outro app do portal (mesma origem, outro bundle),
 * então tem de ser navegação do browser: `<Navigate/>` só se move dentro deste BrowserRouter e
 * produziria `/maturity/admin` de novo.
 *
 * `replace` para o botão Voltar não cair no redirecionador e ricochetear.
 */
function RedirectToNeoAdmin() {
  useEffect(() => {
    window.location.replace("/admin/");
  }, []);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-venice-textTertiary">
      A administração agora fica no NEO. Levando você para lá…
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {/* basename segue o base do build: '/' em dev/standalone, '/maturity' no portal NEO. */}
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Shell><Inicio /></Shell>} />
                  <Route path="/torre" element={<Shell><Torre /></Shell>} />
                  <Route path="/guia" element={<Shell><Guia /></Shell>} />
                  {/* A administração saiu do MMA e virou o app `/admin` do NEO (31/07/2026):
                      administrar a organização não é usar o modelo de maturidade, e enquanto a
                      tela morava aqui "quem administra o MMA" e "quem administra o NEO" eram a
                      mesma pessoa por acidente de layout.

                      A rota FICA, como redirecionamento: `/maturity/admin` está em favorito, em
                      link de mensagem e na memória de quem usava. Removê-la seca daria 404 sem
                      dizer para onde ir. É redirect de navegador (não <Navigate/>) porque o
                      destino é OUTRO app do portal, fora deste BrowserRouter. */}
                  <Route path="/admin" element={<RedirectToNeoAdmin />} />

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

                  {/* Redirects legados (app antigo → Portal MMA). O login vive no hub NEO. */}
                  <Route path="/auth" element={<Navigate to="/" replace />} />
                  <Route path="/login" element={<Navigate to="/" replace />} />
                  <Route path="/reset-password" element={<Navigate to="/" replace />} />
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
