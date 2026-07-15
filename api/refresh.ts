/**
 * POST /api/refresh  → dispara o workflow de sync do Jira (workflow_dispatch) no GitHub Actions.
 * GET  /api/refresh  → retorna o status da última execução do workflow (para polling na UI).
 *
 * O token do GitHub vive APENAS no servidor (env GITHUB_DISPATCH_TOKEN na Vercel) — nunca
 * vai para o cliente. Reaproveita o pipeline de sync existente (.github/workflows/hourly-sync.yml):
 * o sync roda no Actions, comita src/data.json + src/data-meta.json e a Vercel redeploya.
 * Portanto NÃO é instantâneo (~2-5 min de sync + redeploy) — a UI comunica isso.
 *
 * Anti-spam: antes de disparar, checamos se já há uma execução em andamento; se houver,
 * não disparamos outra.
 */


// ── Sessão (inline; ver nota em comments.ts) ───────────────────────────────
// Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node).
interface ApiRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
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
// ────────────────────────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';

function ghConfig() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO; // ex.: "owner/locavia-dashboard"
  const workflow = process.env.GITHUB_WORKFLOW || 'hourly-sync.yml';
  const ref = process.env.GITHUB_REF || 'main';
  return { token, repo, workflow, ref };
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'locavia-dashboard-refresh',
  };
}

async function latestRun(repo: string, workflow: string, token: string) {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/actions/workflows/${workflow}/runs?per_page=1`,
    { headers: ghHeaders(token) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.workflow_runs?.[0] ?? null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Mesma origem (a SPA chama o próprio domínio); não liberamos CORS para qualquer origem.
  res.setHeader('Cache-Control', 'no-store');

  // Gate de login (quando configurado): só usuário autenticado dispara/consulta o sync.
  if (!(await isAuthed(req))) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const { token, repo, workflow, ref } = ghConfig();

  if (req.method === 'GET') {
    if (!token || !repo) {
      return res.status(503).json({ error: 'Refresh não configurado (faltam GITHUB_DISPATCH_TOKEN/GITHUB_REPO).' });
    }
    try {
      const run = await latestRun(repo, workflow, token);
      if (!run) return res.status(200).json({ status: 'unknown' });
      return res.status(200).json({
        status: run.status,          // queued | in_progress | completed
        conclusion: run.conclusion,  // success | failure | null
        createdAt: run.created_at,
        url: run.html_url,
      });
    } catch (e) {
      return res.status(500).json({ error: 'Falha ao consultar status', details: e instanceof Error ? e.message : String(e) });
    }
  }

  if (req.method === 'POST') {
    if (!token || !repo) {
      return res.status(503).json({ error: 'Refresh não configurado (faltam GITHUB_DISPATCH_TOKEN/GITHUB_REPO).' });
    }
    try {
      // Evita disparos concorrentes: se já há run em andamento, não dispara outro.
      const run = await latestRun(repo, workflow, token);
      if (run && (run.status === 'queued' || run.status === 'in_progress')) {
        return res.status(202).json({ ok: true, alreadyRunning: true, message: 'Sincronização já em andamento.' });
      }

      const dispatch = await fetch(
        `${GITHUB_API}/repos/${repo}/actions/workflows/${workflow}/dispatches`,
        { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ ref }) }
      );

      if (!dispatch.ok) {
        const text = await dispatch.text().catch(() => '');
        return res.status(502).json({ error: 'GitHub recusou o dispatch', status: dispatch.status, details: text });
      }

      return res.status(202).json({ ok: true, message: 'Sincronização iniciada.' });
    } catch (e) {
      return res.status(500).json({ error: 'Falha ao disparar sincronização', details: e instanceof Error ? e.message : String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
