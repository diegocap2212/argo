// Endpoint de trigger do sync — chamado por um cron externo confiável (ex.: cron-job.org)
// a cada 30 min. Valida um segredo de baixo valor (CRON_SECRET) e dispara o workflow_dispatch
// da GitHub Action `hourly-sync.yml`. O PAT do GitHub (GITHUB_DISPATCH_TOKEN) fica server-side
// no Vercel — nunca no serviço de cron.
//
// Configuração (env no Vercel):
//   CRON_SECRET           — segredo que o cron externo envia (?key=... ou header x-cron-key)
//   GITHUB_DISPATCH_TOKEN — PAT fine-grained com permissão Actions: Read and write neste repo
//
// repo e workflow são fixos (não são segredos).

const GITHUB_REPO = 'diegocap2212/locavia-dashboard';
const GITHUB_WORKFLOW = 'hourly-sync.yml';

// Tipos mínimos do handler serverless (evita `any` e não exige @vercel/node).
interface ApiRequest {
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const secret = process.env.CRON_SECRET || '';
  const provided =
    req.query?.key ||
    req.headers?.['x-cron-key'] ||
    '';

  if (!secret || provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Missing GITHUB_DISPATCH_TOKEN' });
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'locavia-cron-trigger',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    // GitHub responde 204 No Content em sucesso.
    if (r.status === 204) {
      return res.status(200).json({ ok: true, dispatched: true, at: new Date().toISOString() });
    }
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ ok: false, status: r.status, detail });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'dispatch failed' });
  }
}
