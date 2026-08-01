import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';

/**
 * `basename` vem da `base` do Vite (`/admin/` em produção, `/` em dev). Sem isto o router
 * montaria as rotas na raiz e todo link do app apontaria para fora do `/admin`.
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tela de administração: dado velho aqui faz alguém decidir sobre um estado que já mudou.
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
