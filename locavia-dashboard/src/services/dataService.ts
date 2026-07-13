export interface JiraItem {
  Type: string;
  Key: string;
  Summary: string | unknown;
  Status: string;
  StatusCategory: 'TODO' | 'IN_PROGRESS' | 'DONE';
  Team: string;
  Created: string;
  Resolved: string | null;
  UpdatedAt: string;
  Release: string;
  [key: string]: unknown;
}

/**
 * Busca o dataset do endpoint AUTENTICADO `/api/data` (same-origin, cookie de sessão
 * enviado automaticamente). O data.json não é mais importado no client — só o servidor
 * o entrega, e apenas com sessão válida.
 *
 * Memoizado em nível de módulo: todos os consumidores (hooks + AppShell) compartilham
 * uma única chamada de rede por carga da página.
 */
let dataPromise: Promise<JiraItem[]> | null = null;

async function loadData(): Promise<JiraItem[]> {
  const res = await fetch('/api/data', { credentials: 'same-origin' });
  if (res.status === 401) {
    throw new Error('Não autenticado para acessar os dados.');
  }
  if (!res.ok) {
    throw new Error(`Falha ao carregar dados (${res.status}).`);
  }
  const body = await res.json();
  const items = (body?.items ?? body) as JiraItem[];
  if (!Array.isArray(items)) {
    throw new Error('Resposta de dados inválida.');
  }
  return items;
}

export const fetchData = async (): Promise<JiraItem[]> => {
  if (!dataPromise) {
    dataPromise = loadData().catch(err => {
      // Não cacheia falha: permite retry numa próxima chamada.
      dataPromise = null;
      throw err;
    });
  }
  return dataPromise;
};
