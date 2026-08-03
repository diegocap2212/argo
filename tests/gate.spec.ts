// `gateCookie` saiu daqui em 2026-07-31: o único caso que o usava era "o Nero abre com sessão
// + senha", e a senha deixou de existir. O helper continua em fixtures.ts enquanto api/gate.ts
// existir; os dois saem juntos, depois da janela.
import {
  expect,
  expiredSessionCookie,
  forgedSessionCookie,
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

  // Regressão de 2026-07-26, encontrada em PRODUÇÃO: `/nero/` (com barra) não casava com
  // `/nero` nem com `/nero/:path*`, caía no catch-all e servia o HTML do HUB — e é exatamente
  // para onde a porta 03 aponta, então o Nero ficava inalcançável pelo caminho normal.
  // Sem sessão os três dão 302 (coberto acima); logado, o teste é "não serviu o hub".
  test('as três formas de entrar no Nero existem no roteamento', async ({ request }) => {
    for (const p of ['/nero', '/nero/', '/nero/login']) {
      const r = await request.get(p, { maxRedirects: 0 });
      expect(r.status(), `${p} deveria ser barrado sem sessão`).toBe(302);
    }
  });

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

  // Erro de desenho MEU, corrigido: a versão anterior afirmava `toBeVisible()` nas portas. Não
  // dá — o hub revela `#doors` a partir da sessão do SUPABASE no localStorage, e forjar o
  // cookie HMAC (que é o que o middleware lê) não cria sessão Supabase. O teste falhava por
  // limitação da fixture, não por defeito do produto, e um teste que falha por motivo errado é
  // pior que teste nenhum. O que é verificável sem sessão Supabase é o DOM e o destino da
  // porta; a visibilidade fica no roteiro manual do ONBOARDING.
  test('as três portas existem no hub, com o Nero marcado como restrito', async ({ neoPage }) => {
    await neoPage.goto('/');
    for (const id of ['#door-performance', '#door-maturity', '#door-nero']) {
      await expect(neoPage.locator(id)).toHaveCount(1);
    }
    // A trava extra tem de estar anunciada na porta — o usuário não deve descobrir no meio.
    await expect(neoPage.locator('#door-nero')).toContainText(/restrito/i);
    // E a porta tem de apontar para um caminho que o roteamento realmente resolve.
    expect(await neoPage.locator('#door-nero').getAttribute('href')).toMatch(/^\/nero\/?$/);
  });

  test('a Administração é link discreto, não uma quarta porta', async ({ neoPage }) => {
    await neoPage.goto('/');
    // Existe no DOM (a visibilidade depende de `neo.admin.access`, que exige sessão Supabase —
    // fica no roteiro manual, como as outras portas).
    await expect(neoPage.locator('#link-admin')).toHaveCount(1);
    expect(await neoPage.locator('#link-admin').getAttribute('href')).toMatch(/^\/admin\/?$/);
    // E NÃO pode ter voltado a ser card: governança de acesso não é vitrine, e um card do
    // tamanho dos outros anuncia a existência dela para quem só passa os olhos.
    await expect(neoPage.locator('#door-admin')).toHaveCount(0);
  });

  test('Dash e Maturity abrem com sessão + a permissão da porta', async ({ neoContext }) => {
    for (const path of ['/dash/', '/maturity/']) {
      expect((await neoContext.request.get(path, { maxRedirects: 0 })).status()).toBe(200);
    }
  });

  // ── As duas recusas da borda, que só existem desde o RBAC ──
  // Elas parecem iguais de fora (302 para o hub) e são casos DIFERENTES. Confundi-los foi o
  // risco central do desenho: tratar "cookie velho" como "sem permissão" transformaria toda
  // sessão viva num acesso negado no dia do deploy.

  test('cookie de ANTES do RBAC vai para a autocura, não para acesso negado', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext();
    // `perms: undefined` — exatamente o cookie que existia antes de 31/07.
    await ctx.addCookies([await neoSessionCookie(baseURL!, 'e2e@lmmobilidade.com.br', undefined)]);
    const r = await ctx.request.get('/maturity/', { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    const loc = r.headers()['location'] ?? '';
    expect(loc).toContain('next=');
    // SEM `negado=`: é o hub que decide, e ele vai re-emitir o cookie com claims frescas.
    // Se este marcador aparecer, a borda está chamando de "sem permissão" o que é só "velho".
    expect(loc).not.toContain('negado=');
    await ctx.close();
  });

  test('claims assadas SEM a permissão da porta são recusa explícita', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext();
    // Tem claims, mas não a do MMA — o caso de quem realmente não pode entrar.
    await ctx.addCookies([
      await neoSessionCookie(baseURL!, 'e2e@lmmobilidade.com.br', ['neo.dash.access']),
    ]);
    const r = await ctx.request.get('/maturity/', { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    expect(r.headers()['location'] ?? '').toContain('negado=neo.mma.access');
    // E a porta que ELE tem continua abrindo — a recusa é da porta, não da sessão.
    expect((await ctx.request.get('/dash/', { maxRedirects: 0 })).status()).toBe(200);
    await ctx.close();
  });

  // ⚠️ ESTE CASO MUDOU DE MOTIVO EM 2026-07-31, MANTENDO O COMPORTAMENTO.
  //
  // Ele se chamava "o Nero NÃO abre só com a sessão — exige a senha própria". A senha
  // compartilhada foi eliminada: quem decide agora é a permissão `neo.nero.access`, perguntada
  // pelo proxy ao /api/authz a cada navegação. O redirecionamento para /nero/login continua
  // acontecendo — mas porque falta PERMISSÃO, não porque falta senha. A tela de destino também
  // mudou: não pede mais nada, explica a quem pedir.
  //
  // O e-mail que a fixture forja não tem papel no banco, então /api/authz responde 403 e o
  // proxy fecha. É exatamente o caminho que uma pessoa sem acesso percorre.
  test('o Nero NÃO abre sem a permissão neo.nero.access', async ({ neoContext }) => {
    test.skip(!FULL_STACK, 'exige o Nero já cortado para o código novo (basePath + proxy)');
    const r = await neoContext.request.get('/nero/', { maxRedirects: 0 });
    // 307 e não 302: quem responde aqui é o proxy do Next (do Nero), não o middleware do
    // portal, que monta a Response à mão com 302. São camadas diferentes com convenções
    // diferentes; a primeira versão deste teste confundia as duas.
    expect([302, 307]).toContain(r.status());
    expect(r.headers()['location'] ?? '').toContain('/nero/login');
  });

  // O CAMINHO POSITIVO SAIU DAQUI, e a ausência é deliberada.
  //
  // Era "o Nero abre com sessão + senha": bastava forjar os dois cookies. Com permissão
  // individual não há atalho equivalente — abrir o Nero exige que o e-mail do cookie TENHA
  // `neo.nero.access` no banco. Forjar isso significaria conceder papel real a um e-mail de
  // teste em PRODUÇÃO (é contra produção que esta suíte roda) e depois revogá-lo, deixando
  // rastro na trilha de auditoria e uma janela em que um e-mail inventado tem acesso.
  //
  // Trocar uma verificação automática por um risco em produção é mau negócio. O caminho
  // positivo fica no roteiro manual do ONBOARDING, com conta real — junto com "as portas
  // aparecem", que já estava lá pelo mesmo tipo de limitação de fixture.
});

// ════════════════════════════════════════════════════════════════════════════
// /api/authz — o endpoint que substituiu a senha do Nero
//
// Sem sessão não há o que perguntar. Estes casos não precisam forjar cookie, então rodam
// sempre — inclusive no cron, que é onde a regressão apareceria.
// ════════════════════════════════════════════════════════════════════════════
test.describe('/api/authz — autorização ao vivo', () => {
  test('sem sessão é 401, nunca 200', async ({ request }) => {
    const r = await request.get('/api/authz?perm=neo.nero.access');
    expect(r.status()).toBe(401);
  });

  test('permissão malformada é 400 — não vira consulta ao banco', async ({ request }) => {
    for (const perm of ['lixo', 'neo.nero', 'neo.nero.access; drop', '']) {
      const r = await request.get(`/api/authz?perm=${encodeURIComponent(perm)}`);
      expect(r.status()).toBe(400);
    }
  });

  test('sem o parâmetro perm é 400', async ({ request }) => {
    expect((await request.get('/api/authz')).status()).toBe(400);
  });

  test('método não suportado é 405', async ({ request }) => {
    expect((await request.fetch('/api/authz?perm=neo.nero.access', { method: 'POST' })).status()).toBe(405);
  });

  test('a resposta nunca é cacheável', async ({ request }) => {
    const r = await request.get('/api/authz?perm=neo.nero.access');
    expect(r.headers()['cache-control'] ?? '').toContain('no-store');
  });
});

// ⚠️ ENDPOINT LEGADO, SEM CHAMADOR DESDE 2026-07-31.
//
// A Torre passou a depender de `dash.tower.view` e o Nero de `neo.nero.access`. Ninguém mais LÊ
// os cookies `neo_tower`/`neo_nero`, então este endpoint emite para ninguém — está inerte.
//
// Os casos abaixo FICAM até o arquivo sair (depois da janela, junto com TOWER_PASSWORD e
// NERO_PASSWORD — ver SECRETS.md). Enquanto o endpoint estiver no ar ele precisa continuar se
// comportando: escopo inválido é 400, sem sessão é 401. Um endpoint inerte que passa a aceitar
// qualquer coisa é pior do que um endpoint em uso.
test.describe('/api/gate — legado, sem chamador (sai com o arquivo)', () => {
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
