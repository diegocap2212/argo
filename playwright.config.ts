import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do PORTAL (origem única), não de um app isolado.
 *
 * O valor está em testar o que nenhum app testa sozinho: o gate na borda, a matriz de acesso
 * das três ferramentas e o roteamento entre elas. A suíte do Dash (locavia-dashboard/tests)
 * continua onde está, cobrindo o app por dentro.
 *
 * SEM `webServer` de propósito: `vercel dev` não executa o Edge Middleware nem as functions
 * do jeito que a produção executa (está no HANDOFF), então testar contra localhost daria uma
 * falsa sensação de cobertura justamente na parte que mais importa. A suíte roda contra um
 * DEPLOYMENT real, informado por env:
 *
 *   NEO_BASE_URL        origem a testar (ex.: https://neo-lm-verify.vercel.app)
 *   NEO_SESSION_SECRET  o mesmo segredo do deployment — usado para FORJAR cookies válidos
 *   NEO_GATE_PASSWORD   opcional; senha do escopo `nero` para o caminho felizr do gate
 *
 * Por que forjar cookie em vez de automatizar o login: o login é OTP por e-mail, que não se
 * automatiza sem caixa de entrada. Forjando `neo_session` com o segredo real, tudo abaixo do
 * login fica coberto; o leg do OTP fica manual e está documentado no ONBOARDING.
 */
const baseURL = process.env.NEO_BASE_URL || 'https://neo-lm.vercel.app';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // o gate emite cookies; execução serial mantém o estado previsível
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
