// Endpoint autenticado que serve o dataset do Jira.
// Nível 3: o dataset (~5MB) vive no Vercel Blob (privado) — gravado pelo sync. Este endpoint
// lê o blob server-side e entrega só com sessão. Mantém um fallback para o src/data.json
// congelado (último commitado) caso o blob falhe/ainda não exista.
import { get } from '@vercel/blob';
import fallbackData from '../locavia-dashboard/src/data.json' with { type: 'json' };
// `data-meta.json` NÃO é importado aqui de propósito. Ele é o heartbeat do último sync
// (commitado a cada 30 min) e era usado como `syncedAt` do fallback — o que rotulava o
// snapshot congelado de `data.json` como dado de hoje. Ver `getDataset()`.

const BLOB_PATHNAME = 'jira-data.json';

// ── Sessão (inline; a Vercel não empacota imports relativos entre functions) ──
// Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node).
interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

// Autentica (JWT do Supabase via Authorization: Bearer) E autoriza (allowlist do NEO) numa
// única chamada ao RPC is_neo_allowed: o PostgREST rejeita token inválido, e a função retorna
// true só para @lmmobilidade.com.br ou exceção aprovada em neo_access. Ver NEO README.
async function verifyBearer(req: ApiRequest): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const auth = req?.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_neo_allowed`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return r.ok && (await r.json().catch(() => false)) === true;
  } catch {
    return false;
  }
}

// Autoriza pelo JWT do Supabase. Sem env configurada: aberto em dev/preview (paridade
// com o dev local), mas FECHADO em produção — uma regressão de env não deve virar bypass.
async function isAuthed(req: ApiRequest): Promise<boolean> {
  const supabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  if (supabaseConfigured) return verifyBearer(req);
  return process.env.VERCEL_ENV !== 'production';
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrato de resposta do dataset.
 *
 * `source`/`stale` existem porque o fallback MENTIA. `src/data.json` é um array puro, SEM
 * timestamp próprio; `src/data-meta.json` é commitado pelo workflow a cada 30 min. O
 * fallback combinava os dois — itens congelados + `syncedAt` de hoje — e o ETag também
 * dizia "fresco". Não era um risco eventual: sempre que o Blob falhava, a API afirmava que
 * dado velho era atual, e o cliente não tinha como saber.
 *
 * Agora `syncedAt` descreve o dataset REALMENTE servido e é `null` quando desconhecido.
 */
interface Dataset {
  items: unknown[];
  /** Do próprio dataset servido. `null` = desconhecido (nunca emprestado de outra fonte). */
  syncedAt: string | null;
  source: 'blob' | 'fallback';
  /** `true` quando não é o dataset publicado pelo sync. A UI deve avisar. */
  stale: boolean;
  count: number;
  /** Impressão digital do conteúdo, gravada pelo sync. `null` em blob legado/fallback. */
  hash: string | null;
}

async function loadFromBlob(): Promise<Dataset | null> {
  try {
    const res = await get(BLOB_PATHNAME, { access: 'private' });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.items)) {
      return {
        items: parsed.items,
        syncedAt: parsed.syncedAt ?? null,
        source: 'blob',
        stale: false,
        count: typeof parsed.count === 'number' ? parsed.count : parsed.items.length,
        hash: typeof parsed.hash === 'string' ? parsed.hash : null,
      };
    }
    // Blob legado: array puro, sem envelope.
    if (Array.isArray(parsed)) {
      return { items: parsed, syncedAt: null, source: 'blob', stale: false, count: parsed.length, hash: null };
    }
    return null;
  } catch (e) {
    console.error('Blob read falhou, usando fallback:', e);
    return null;
  }
}

// Cache em memória do lambda quente: o dataset (~5MB) só muda quando o sync roda (≤30 min),
// então reler+parsear o blob a cada request é desperdício. Mantém o último Dataset por TTL curto
// para invocações quentes responderem sem tocar o Blob de novo.
const CACHE_TTL_MS = 60_000;
let cached: { dataset: Dataset; at: number } | null = null;

async function getDataset(): Promise<Dataset> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.dataset;
  const blob = await loadFromBlob();
  const dataset: Dataset = blob ?? {
    items: fallbackData as unknown[],
    // NUNCA `fallbackMeta.syncedAt`. Aquele timestamp é o heartbeat do ÚLTIMO SYNC, não a
    // data destes itens — o workflow commita `data-meta.json` a cada 30 min e não commita
    // `data.json`. Emprestá-lo aqui era exatamente a mentira: dado congelado com data de
    // hoje. `null` diz a verdade: não sabemos quando este snapshot foi gerado.
    syncedAt: null,
    source: 'fallback',
    stale: true,
    count: (fallbackData as unknown[]).length,
    hash: null,
  };
  cached = { dataset, at: now };
  return dataset;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await isAuthed(req))) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const dataset = await getDataset();

  // ETag deriva de source+hash+count+syncedAt, nesta ordem. Antes era só
  // `syncedAt`-`length`, e como o fallback herdava o syncedAt do heartbeat, dado velho e
  // dado novo podiam gerar o MESMO ETag — o browser servia stale indefinidamente.
  const etag = `W/"data-${dataset.source}-${dataset.hash ?? 'nohash'}-${dataset.count}-${dataset.syncedAt ?? 'unknown'}"`;
  // O dataset só muda quando o sync roda (≤30 min). Um max-age curto deixa o browser
  // reusar entre navegações/reloads sem round-trip; o ETag cobre a revalidação após expirar.
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=900');
  res.setHeader('ETag', etag);
  if (req.headers?.['if-none-match'] === etag) {
    return res.status(304).end();
  }

  return res.status(200).json(dataset);
}
