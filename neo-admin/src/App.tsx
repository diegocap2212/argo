import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Acesso } from '@/pages/Acesso';
import { Auditoria } from '@/pages/Auditoria';
import { Matriz } from '@/pages/Matriz';
import { Pessoas } from '@/pages/Pessoas';
import { Squads } from '@/pages/Squads';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/pessoas" replace />} />
        <Route path="/pessoas" element={<Pessoas />} />
        <Route path="/matriz" element={<Matriz />} />
        <Route path="/acesso" element={<Acesso />} />
        <Route path="/squads" element={<Squads />} />
        <Route path="/auditoria" element={<Auditoria />} />
        {/* Rota desconhecida vai para a primeira tela, não para um 404 próprio: a borda já
            garantiu que quem chegou aqui tem `neo.admin.access`. */}
        <Route path="*" element={<Navigate to="/pessoas" replace />} />
      </Route>
    </Routes>
  );
}
