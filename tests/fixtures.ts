import { type BrowserContext, type Page, expect, test as base } from '@playwright/test';
import { signToken } from '../packages/neo-auth/src/index.ts';

/**
 * Fixtures do e2e do portal.
 *
 * O ponto central: os cookies são assinados com `@neo/auth`, o MESMO módulo que o middleware
 * e as functions usam para verificar. Se o teste tivesse a própria cópia da criptografia,
 * poderia passar enquanto produção rejeita — e um teste que concorda consigo mesmo não prova
 * nada. Aqui, se o formato do token divergir, o e2e quebra junto com a produção.
 */

const TTL_MS = 60 * 60 * 1000;

export function requireSecret(): string {
  const s = process.env.NEO_SESSION_SECRET;
  if (!s) {
    throw new Error(
      'NEO_SESSION_SECRET não definida. A suíte forja cookies com o segredo do deployment ' +
        'sob teste — sem ele não há como exercitar nada além da matriz sem sessão.',
    );
  }
  return s;
}

/**
 * Cookie de sessão do portal (o que o hub emite após o login OTP).
 *
 * ⚠️ AS CLAIMS SÃO OBRIGATÓRIAS DESDE O RBAC (2026-07-31). Antes bastava e-mail + `exp`; hoje a
 * borda também confere a permissão da porta, e um cookie sem `perms` é lido como "anterior ao
 * RBAC" — a borda manda ao hub para re-emissão em vez de servir a app. Sem estas claims, todo
 * caso que espera 200 numa porta falharia por limitação da fixture, não por defeito do produto.
 *
 * Assinar claims aqui NÃO é furar a segurança: quem tem o SESSION_SECRET já podia forjar
 * qualquer sessão. E as claims são só PRÉ-FILTRO de navegação — atrás de cada porta há
 * verificação ao vivo (RLS com o JWT, has_perm no /api/data, /api/authz no Nero), que este
 * cookie não abre. É por isso que o caso positivo do Nero saiu da suíte.
 *
 * O default cobre as portas que toda pessoa do NEO tem (`todos` na matriz). Passe `perms`
 * explícito para exercitar ausência de permissão.
 */
export async function neoSessionCookie(
  baseURL: string,
  email = 'e2e@neo.test',
  perms: string[] = ['neo.dash.access', 'neo.mma.access'],
) {
  const token = await signToken({ email, exp: Date.now() + TTL_MS, perms }, requireSecret());
  return cookieFor(baseURL, 'neo_session', token);
}

/** Cookie da trava extra (escopo `nero` ou `tower`), o que /api/gate emite. */
export async function gateCookie(baseURL: string, scope: 'nero' | 'tower') {
  const token = await signToken({ exp: Date.now() + TTL_MS }, requireSecret());
  return cookieFor(baseURL, scope === 'nero' ? 'neo_nero' : 'neo_tower', token);
}

function cookieFor(baseURL: string, name: string, value: string) {
  const { hostname } = new URL(baseURL);
  return { name, value, domain: hostname, path: '/', httpOnly: true, secure: true } as const;
}

/** Um token com assinatura válida mas EXPIRADO — para provar que exp é checado de fato. */
export async function expiredSessionCookie(baseURL: string) {
  const token = await signToken({ exp: Date.now() - 1000 }, requireSecret());
  return cookieFor(baseURL, 'neo_session', token);
}

/** Um token com formato correto assinado com o segredo ERRADO. */
export async function forgedSessionCookie(baseURL: string) {
  const token = await signToken({ exp: Date.now() + TTL_MS }, 'segredo-que-nao-e-o-do-servidor');
  return cookieFor(baseURL, 'neo_session', token);
}

type Fixtures = {
  /** Contexto já com `neo_session` válido — simula usuário logado no NEO. */
  neoContext: BrowserContext;
  /** Página já com `neo_session` válido. */
  neoPage: Page;
};

export const test = base.extend<Fixtures>({
  neoContext: async ({ browser, baseURL }, use) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([await neoSessionCookie(baseURL!)]);
    await use(ctx);
    await ctx.close();
  },
  neoPage: async ({ neoContext }, use) => {
    const page = await neoContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
