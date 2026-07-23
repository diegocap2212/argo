import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import AppShell from './components/AppShell';
import { SM_CONFIGS } from './config/sm-config';
import { SMDashboard } from './pages/SMDashboard';
import './App.css';

const PerformanceDashboard = lazy(() => import('./pages/PerformanceDashboard'));
const TeamDetail = lazy(() => import('./pages/TeamDetail'));
const TowerView = lazy(() => import('./pages/TowerView'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const ModuleErrors = lazy(() => import('./pages/ModuleErrors'));

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
    <RefreshCw className="animate-spin" size={28} color="var(--primary)" />
  </div>
);

const SMDashboardWrapper = () => {
  const { smId } = useParams();
  const config = SM_CONFIGS.find(candidate => candidate.id === smId);
  return config
    ? <SMDashboard smConfig={config} />
    : <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Agilista não encontrado.</div>;
};

const App = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Suspense fallback={<Loading />}><PerformanceDashboard /></Suspense>} />
      <Route path="/torre" element={<Suspense fallback={<Loading />}><TowerView /></Suspense>} />
      <Route path="/sm/:smId" element={<SMDashboardWrapper />} />
      <Route path="/time/:teamId" element={<Suspense fallback={<Loading />}><TeamDetail /></Suspense>} />
      <Route path="/modulos" element={<Suspense fallback={<Loading />}><ModuleErrors /></Suspense>} />
      <Route path="/api-docs" element={<Suspense fallback={<Loading />}><ApiDocs /></Suspense>} />
      {/* URLs antigas permanecem como redirects para favoritos já salvos. */}
      <Route path="/release/:releaseId" element={<Navigate to="/" replace />} />
      <Route path="/datas-releases" element={<Navigate to="/" replace />} />
      <Route path="/cone-bf-cem" element={<Navigate to="/" replace />} />
      <Route path="/releases-legacy" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AppShell>
);

export default App;
