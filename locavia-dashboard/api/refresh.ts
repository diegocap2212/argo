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

import crypto from 'crypto';

// ── Sessão (inline; ver nota em comments.ts) ───────────────────────────────
const SESSION_COOKIE = 'dash_session';
function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function verifyToken(token: string, secret: string): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}
function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
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

function isAuthed(req: ApiRequest): boolean {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret || !process.env.DASHBOARD_PASSWORD) return true;
  const token = parseCookie(req?.headers?.cookie, SESSION_COOKIE);
  return !!token && verifyToken(token, secret);
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
  if (!isAuthed(req)) {
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
