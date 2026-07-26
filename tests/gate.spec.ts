import {
  expect,
  expiredSessionCookie,
  forgedSessionCookie,
  gateCookie,
  neoSessionCookie,
  test,
} from './fixtures.ts';

/**
 * Matriz de acesso do Portal NEO. É o teste que nenhum app faz sozinho: o gate vive no
 * middleware da borda + nas functions, e a única forma de exercitá-lo é contra um deployment.
 *
 * As três ferramentas ficam atrás do MESMO cookie `neo_session`; o Nero exige ainda `neo_nero`.
 */

const APPS = ['/dash/', '/maturity/', '/nero/'] as const;

/**
 * Alguns testes só fazem sentido contra um deployment COMPLETO. Em vez de deixá-los vermelhos
 * num ambiente parcial — o que treina o time a ignorar vermelho — eles pulam com o motivo
 * escrito. Ligue com NEO_FULL_STACK=1 quando o deployment tiver:
 *   - VITE_SUPABASE_* configuradas (sem elas o hub nunca revela as portas: o `#doors` só sai
 *     do hidden depois do reconcile da sessão no cliente, que depende do Supabase);
 *   - o Nero já cortado para o código novo (basePath /nero + proxy de duas travas).
 * O harness descartável usado no desenvolvimento não tem nenhum dos dois.
 */
const FULL_STACK = process.env.NEO_FULL_STACK === '1';

/**
 * Forjar cookie exige o segredo do deployment. Sem ele, a matriz SEM SESSÃO ainda roda por
 * inteiro — e é justamente ela que o CI pode rodar contra produção sem nenhum segredo, porque
 * só verifica que portas fechadas estão fechadas.
 */
const HAS_SECRET = !!process.env.NEO_SESSION_SECRET;

test.describe('sem sessão — nada além do hub', () => {
  // `request` em vez de `page` porque queremos o status BRUTO: o navegador segue o 302 e
  // esconde exatamente o que precisamos medir.
  test('o hub é público', async ({ request }) => {
    expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(200);
  });

  for (const path of APPS) {
    test(`${path} redireciona para o hub preservando o destino`, async ({ request }) => {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status()).toBe(302);
      const loc = r.headers()['location'] ?? '';
      expect(loc).toContain('/?next=');
      // O ?next é o que faz o usuário voltar para onde queria depois de logar.
      expect(decodeURIComponent(loc)).toContain(path);
      // Um 302 cacheado deixaria o usuário preso no redirect após logar (bug já corrigido
      // uma vez no middleware — ver HANDOFF).
      expect(r.headers()['cache-control'] ?? '').toContain('no-store');
    });
  }

  // Barrar só o HTML deixaria o bundle e os dados acessíveis a quem soubesse a URL do asset.
  test('assets profundos também são barrados, não só o HTML', async ({ request }) => {
    for (const asset of ['/dash/assets/index.js', '/nero/_next/static/chunk.js']) {
      expect((await request.get(asset, { maxRedirects: 0 })).status()).toBe(302);
    }
  });

  test('as functions negam sem Bearer', async ({ request }) => {
    expect((await request.get('/api/data')).status()).toBe(401);
    expect((await request.post('/api/session')).status()).toBe(401);
  });
});

test.describe('cookie inválido não abre porta', () => {
  test.skip(!HAS_SECRET, 'NEO_SESSION_SECRET ausente — não é possível forjar cookie');

  test('assinatura correta mas EXPIRADO é rejeitado', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([await expiredSessionCookie(baseURL!)]);
    const r = await ctx.request.get('/dash/', { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    await ctx.close();
  });

  test('token assinado com o segredo errado é rejeitado', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([await forgedSessionCookie(baseURL!)]);
    const r = await ctx.request.get('/dash/', { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    await ctx.close();
  });

  // Regressão: `neo_session=%` derrubava a function com 500 (decodeURIComponent lança).
  test('cookie malformado devolve 302/401, nunca 500', async ({ request }) => {
    const r = await request.get('/dash/', {
      headers: { Cookie: 'neo_session=%' },
      maxRedirects: 0,
    });
    expect(r.status()).not.toBe(500);
    expect([302, 401]).toContain(r.status());
  });
});

test.describe('com sessão do NEO', () => {
  test.skip(!HAS_SECRET, 'NEO_SESSION_SECRET ausente — não é possível forjar cookie');

  test('o hub mostra as TRÊS portas', async ({ neoPage }) => {
    test.skip(!FULL_STACK, 'exige VITE_SUPABASE_* no deployment (o reveal das portas é client-side)');
    await neoPage.goto('/');
    // As portas só aparecem depois do reconcile da sessão no cliente.
    await expect(neoPage.locator('#doors')).toBeVisible({ timeout: 20_000 });
    for (const id of ['#door-performance', '#door-maturity', '#door-nero']) {
      await expect(neoPage.locator(id)).toBeVisible();
    }
    // A porta do Nero anuncia a trava extra — o usuário não deve descobrir no meio do caminho.
    await expect(neoPage.locator('#door-nero')).toContainText(/restrito/i);
  });

  test('Dash e Maturity abrem com só a sessão do NEO', async ({ neoContext }) => {
    for (const path of ['/dash/', '/maturity/']) {
      expect((await neoContext.request.get(path, { maxRedirects: 0 })).status()).toBe(200);
    }
  });

  test('o Nero NÃO abre só com a sessão — exige a senha própria', async ({ neoContext }) => {
    test.skip(!FULL_STACK, 'exige o Nero já cortado para o código novo (basePath + proxy de 2 travas)');
    const r = await neoContext.request.get('/nero/', { maxRedirects: 0 });
    // 302 para a tela de senha (não para o hub: a sessão do portal está válida).
    expect(r.status()).toBe(302);
    expect(r.headers()['location'] ?? '').toContain('/nero/login');
  });

  test('o Nero abre com sessão + senha', async ({ browser, baseURL }) => {
    test.skip(!FULL_STACK, 'exige o Nero já cortado para o código novo');
    const ctx = await browser.newContext();
    await ctx.addCookies([await neoSessionCookie(baseURL!), await gateCookie(baseURL!, 'nero')]);
    expect((await ctx.request.get('/nero/', { maxRedirects: 0 })).status()).toBe(200);
    await ctx.close();
  });
});

test.describe('/api/gate — com sessão do NEO', () => {
  test.skip(!HAS_SECRET, 'NEO_SESSION_SECRET ausente — não é possível forjar cookie');
  // Vive aqui e não no bloco "com sessão do NEO"? Não: PRECISA da sessão, e o `test.skip` no
  // corpo não salva — a fixture `neoContext` roda ANTES do corpo e falharia ao forjar o cookie
  // sem o segredo. Por isso o guarda é do describe inteiro, abaixo.
  test('senha errada com sessão válida é 403 (ou 503 sem rate-limit)', async ({
    neoContext,
  }) => {
    const r = await neoContext.request.post('/api/gate?scope=nero', {
      data: { password: 'senha-errada-de-proposito' },
    });
    // 503 = fail-closed deliberado quando o Upstash não está configurado: o gate se recusa a
    // validar senha sem proteção anti-brute-force. Ver QA-REVIEW §9.
    expect([403, 503]).toContain(r.status());
  });
});

test.describe('/api/gate — a trava por senha', () => {
  test('escopo inválido é 400, não cai num escopo padrão', async ({ request }) => {
    // Aceitar escopo desconhecido apontaria para env/cookie inexistentes e poderia abrir.
    for (const q of ['?scope=admin', '?scope=', '']) {
      expect((await request.get(`/api/gate${q}`)).status()).toBe(400);
    }
  });

  test('método não suportado é 405', async ({ request }) => {
    expect((await request.fetch('/api/gate?scope=nero', { method: 'PUT' })).status()).toBe(405);
  });

  test('GET sem cookie da trava é 401', async ({ request }) => {
    expect((await request.get('/api/gate?scope=nero')).status()).toBe(401);
  });

  // O MAIS IMPORTANTE: a senha sozinha não vale. A identidade do NEO é checada ANTES.
  test('senha correta sem sessão do NEO é 401', async ({ request }) => {
    const password = process.env.NEO_GATE_PASSWORD;
    test.skip(!password, 'NEO_GATE_PASSWORD não definida');
    const r = await request.post('/api/gate?scope=nero', { data: { password } });
    expect(r.status()).toBe(401);
  });


  test('a Torre segue no mesmo endpoint (regressão da migração api/tower → api/gate)', async ({
    request,
  }) => {
    // Não pode ser 404: significaria que o endpoint da Torre sumiu no refactor.
    expect([401, 503]).toContain((await request.get('/api/gate?scope=tower')).status());
  });

  test('o endpoint antigo /api/tower foi removido', async ({ request }) => {
    expect((await request.get('/api/tower')).status()).toBe(404);
  });
});
