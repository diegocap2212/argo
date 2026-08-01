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
 * Busca o dataset do endpoint AUTENTICADO `/api/data`, enviando o access token do Supabase
 * como Bearer. O data.json não é mais importado no client — só o servidor o entrega, e apenas
 * com sessão válida (autorizada pela allowlist do NEO).
 *
 * Memoizado em nível de módulo: todos os consumidores (hooks + AppShell) compartilham
 * uma única chamada de rede por carga da página.
 */
import { authHeaders, redirectToHub } from './authService';

/**
 * Procedência do dataset, declarada pelo `/api/data`. Existe para a UI poder AVISAR quando
 * está mostrando o fallback congelado: antes o endpoint devolvia o snapshot antigo com o
 * timestamp do último sync, e nem o cliente nem a tela tinham como distinguir.
 */
export interface DatasetProvenance {
  /** Do dataset REALMENTE servido. `null` = desconhecido (fallback). Nunca emprestado. */
  syncedAt: string | null;
  source: 'blob' | 'fallback';
  stale: boolean;
  count: number;
  hash: string | null;
  /**
   * A pessoa pode ver a Torre (`dash.tower.view`)? Decidido pelo SERVIDOR, com o JWT dela —
   * substituiu a senha compartilhada, que não tinha identidade nem offboarding.
   *
   * ⚠️ É gate de INTERFACE. O comparativo continua derivável destes mesmos `items` cruzados com
   * `sm-config.ts`, que está no bundle — ver o comentário longo em `api/data.ts`. Não trate
   * este campo como se ele protegesse o dado.
   */
  tower: boolean;
}

let dataPromise: Promise<JiraItem[]> | null = null;
let provenance: DatasetProvenance | null = null;

async function loadData(): Promise<JiraItem[]> {
  const res = await fetch('/api/data', { headers: await authHeaders() });
  if (res.status === 401) {
    // Sessão ausente/expirada/sem acesso → recomeça o login no hub.
    redirectToHub();
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
  provenance = {
    syncedAt: typeof body?.syncedAt === 'string' ? body.syncedAt : null,
    source: body?.source === 'fallback' ? 'fallback' : 'blob',
    stale: body?.stale === true,
    // `count` do servidor é conferido contra o que chegou: divergência = resposta truncada.
    count: typeof body?.count === 'number' ? body.count : items.length,
    hash: typeof body?.hash === 'string' ? body.hash : null,
    // Ausente (endpoint antigo, durante a janela de deploy) = fechado. Um `!== false` aqui
    // abriria a Torre para todo mundo enquanto as duas metades não estivessem no ar juntas.
    tower: body?.tower === true,
  };
  if (provenance.count !== items.length) {
    console.error(
      `[dados] contagem divergente: servidor declarou ${provenance.count}, chegaram ${items.length}.`,
    );
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

/** Procedência do último carregamento. `null` antes do primeiro `fetchData()`. */
export const getDatasetProvenance = (): DatasetProvenance | null => provenance;

/**
 * Descarta o dataset memoizado para que o próximo `fetchData()` vá à rede.
 *
 * A memoização é por ciclo de vida do MÓDULO: sem isto, uma sincronização que acabou de
 * rodar não era refletida sem recarregar a página inteira — a promise resolvida ficava
 * cacheada para sempre.
 */
export const invalidateData = (): void => {
  dataPromise = null;
  provenance = null;
};
