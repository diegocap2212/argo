// Endpoint autenticado que serve o dataset do Jira.
// Nível 3: o dataset (~5MB) vive no Vercel Blob (privado) — gravado pelo sync. Este endpoint
// lê o blob server-side e entrega só com sessão. Mantém um fallback para o src/data.json
// congelado (último commitado) caso o blob falhe/ainda não exista.
import { get } from '@vercel/blob';
import fallbackData from '../locavia-dashboard/src/data.json' with { type: 'json' };
import fallbackMeta from '../locavia-dashboard/src/data-meta.json' with { type: 'json' };

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

// Aceita a sessão nova (JWT do Supabase) OU a antiga (cookie HMAC) durante a migração.
// Fail-open quando nenhum mecanismo está configurado (paridade com o dev local).
async function isAuthed(req: ApiRequest): Promise<boolean> {
  const supabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  return supabaseConfigured ? verifyBearer(req) : true;
}
// ─────────────────────────────────────────────────────────────────────────────

interface Dataset { items: unknown[]; syncedAt: string | null }

async function loadFromBlob(): Promise<Dataset | null> {
  try {
    const res = await get(BLOB_PATHNAME, { access: 'private' });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.items)) return { items: parsed.items, syncedAt: parsed.syncedAt ?? null };
    if (Array.isArray(parsed)) return { items: parsed, syncedAt: null };
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
    syncedAt: (fallbackMeta as { syncedAt?: string }).syncedAt ?? null,
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

  const etag = `W/"data-${dataset.syncedAt || 'fallback'}-${dataset.items.length}"`;
  // O dataset só muda quando o sync roda (≤30 min). Um max-age curto deixa o browser
  // reusar entre navegações/reloads sem round-trip; o ETag cobre a revalidação após expirar.
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=900');
  res.setHeader('ETag', etag);
  if (req.headers?.['if-none-match'] === etag) {
    return res.status(304).end();
  }

  return res.status(200).json(dataset);
}
