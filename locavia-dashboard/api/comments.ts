import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// ── Sessão (inline) ────────────────────────────────────────────────────────
// Inline de propósito: a Vercel não empacota imports relativos entre functions
// (./_session dava ERR_MODULE_NOT_FOUND em runtime). isAuthed retorna true quando
// o gate não está configurado (dev), então não quebra o fluxo local.
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
  query?: Record<string, string | undefined>;
  body?: Record<string, string | undefined>;
}
interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

function isAuthed(req: ApiRequest): boolean {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret || !process.env.DASHBOARD_PASSWORD) return true;
  const token = parseCookie(req?.headers?.cookie, SESSION_COOKIE);
  return !!token && verifyToken(token, secret);
}
// ────────────────────────────────────────────────────────────────────────────

// Inicializa o cliente Redis. Se as variáveis não estiverem definidas,
// ele usará os defaults definidos pelo ambiente da Vercel.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || '',
  token: process.env.KV_REST_API_TOKEN || '',
});

// Hash onde cada campo é um comentário isolado.
// Campo: encodeURIComponent(squadId):...(releaseId):...(periodId):...(metricId)
// Valor: { gap, action }
// Isso permite escrita atômica por campo (HSET), sem read-modify-write do blob inteiro.
//
// Cadência roteia o hash (migração não-destrutiva):
//   'quinzena' → v2 (legado Locavia/BF-CEM)   ·   'semana' → v3_semana (SMDashboard semanal)
const HASH_V2 = 'locavia_dashboard_comments_v2';
const HASH_V3_SEMANA = 'locavia_dashboard_comments_v3_semana';
const SEP = ':';

function hashKeyFor(cadence: unknown): string {
  return cadence === 'semana' ? HASH_V3_SEMANA : HASH_V2;
}

function encodeField(squadId: string, releaseId: string, quinzenaId: string, metricId: string): string {
  return [squadId, releaseId, quinzenaId, metricId].map(encodeURIComponent).join(SEP);
}

// Reconstrói a árvore aninhada que o frontend espera a partir dos campos planos do hash.
type CommentTree = Record<string, Record<string, Record<string, Record<string, unknown>>>>;
function hashToTree(hash: Record<string, unknown>): CommentTree {
  const tree: CommentTree = {};
  for (const [field, value] of Object.entries(hash)) {
    const parts = field.split(SEP).map(decodeURIComponent);
    if (parts.length !== 4) continue;
    const [squadId, releaseId, quinzenaId, metricId] = parts;
    const comment = typeof value === 'string' ? JSON.parse(value) : value;
    if (!tree[squadId]) tree[squadId] = {};
    if (!tree[squadId][releaseId]) tree[squadId][releaseId] = {};
    if (!tree[squadId][releaseId][quinzenaId]) tree[squadId][releaseId][quinzenaId] = {};
    tree[squadId][releaseId][quinzenaId][metricId] = comment;
  }
  return tree;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS travado: só a origem do dashboard (env ALLOWED_ORIGIN) pode chamar de outro site.
  // Chamadas same-origin (a própria SPA) NÃO dependem de CORS e seguem funcionando mesmo sem
  // ALLOWED_ORIGIN setado. Sem `*`: outros sites não conseguem ler/escrever análises pelo browser.
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
  const origin = req.headers?.origin || '';
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    // Preflight de origem não autorizada → recusa.
    if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) {
      res.status(403).end();
      return;
    }
    res.status(200).end();
    return;
  }

  // Gate de login (quando configurado): leitura/escrita de análises exige sessão.
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    if (req.method === 'GET') {
      const hashKey = hashKeyFor(req.query?.cadence);
      const hash = await redis.hgetall(hashKey);
      return res.status(200).json(hash ? hashToTree(hash as Record<string, unknown>) : {});
    }

    if (req.method === 'POST') {
      const body = req.body;
      const { squadId, releaseId, quinzenaId, metricId, gap, action, cadence } = body || {};

      if (!squadId || !releaseId || !quinzenaId || !metricId) {
        return res.status(400).json({
          error: 'Missing required fields: squadId, releaseId, quinzenaId, metricId',
        });
      }

      const hashKey = hashKeyFor(cadence);
      const field = encodeField(squadId, releaseId, quinzenaId, metricId);
      // Timestamp da edição gerado no servidor (fonte autoritativa, evita relógio do cliente).
      const updatedAt = new Date().toISOString();
      // Escrita atômica e isolada: só este campo é tocado. Sem clobber entre editores.
      await redis.hset(hashKey, { [field]: { gap: gap || '', action: action || '', updatedAt } });

      return res.status(200).json({ success: true, message: 'Comment saved successfully', updatedAt });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Redis API Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) });
  }
}
