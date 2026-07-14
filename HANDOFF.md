# HANDOFF — NEO (Núcleo de Evolução e Operação)

> Plano corrente: `C:\Users\Usuario\.claude\plans\fable-precisamos-sincronizar-essas-frolicking-rainbow.md` (Portal unificado).
> **Estado (2026-07-14): PORTAL UNIFICADO em staging validado — aguardando cutover.**

## Portal único (arquitetura nova)

- **1 projeto Vercel (`neo-lm`), deploy da RAIZ do monorepo.** Hub em `/`, Dash em `/dash/**`, MMA em `/maturity/**`, functions em `/api/**` (movidas da pasta do dash para a raiz), `middleware.ts` (Edge) na raiz.
- **Build composto:** `npm run build:portal` (`scripts/build-portal.mjs`) — 3 Vite builds (`--base=/dash/`, `--base=/maturity/`) compostos em `dist/`. **SEM npm workspaces** (hoisting quebrava binário linux do rollup — npm#4828); na Vercel cada app roda `npm ci` com o próprio lock.
- **Auth same-origin:** sessão Supabase única no localStorage da origem. Fragment handoff (`#neo_at`) e postMessage do iframe REMOVIDOS. Iframe Metricas → `/dash/time/:id?embed=1` same-origin.
- **Gate server-side:** login no hub → `POST /api/session` → cookie `neo_session` (HMAC, 12h, HttpOnly). `middleware.ts` exige o cookie para TUDO sob `/dash`/`/maturity` (HTML+assets); sem ele → 302 `/?next=`. Hub segue `?next` interno após login. Logout = `DELETE /api/session` (hub, dash e MMA).
- **Torre restrita:** `/dash/torre` (comparativo SM×SM/time×time, saiu da home) — senha na env `TOWER_PASSWORD` validada em `api/tower.ts` → cookie `neo_tower` 12h. Senha de produção gerada em 2026-07-14 (mostrada 1x ao Diego).

## Cutover — o que FALTA (na ordem)

1. **Copiar envs de produção do projeto locavia-dashboard → neo-lm** (Production): `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `CRON_SECRET`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, `GITHUB_WORKFLOW`, `GITHUB_REF`. (Precisa autorização explícita do Diego para `vercel env pull` no projeto antigo.) Sem o Blob token o `/api/data` cai no fallback commitado.
2. **Diego testa o staging logado**: `https://neo-esd0urp0t-diegocaporusso-2820s-projects.vercel.app` (SSO da Vercel deixa ele entrar). Roteiro: login OTP → doors → `/dash/` abre → `/maturity/` abre → iframe Metricas → Torre pede senha → logout re-bloqueia.
3. **Redeploy com envs completas** (`vercel deploy --target=production --skip-domain`) + smoke → **`vercel promote <deployment>`** (vira o domínio neo-lm.vercel.app).
4. **Projetos antigos → redirects 308** (os DOIS juntos): pastas `redirects/locavia-dashboard/` e `redirects/maturitymodel/` com vercel.json de redirect para `https://neo-lm.vercel.app/dash/:path*` e `/maturity/:path*`; `vercel --prod` em cada uma linkada ao projeto antigo.
5. **Cron externo** que chama `/api/trigger-sync`: apontar para `https://neo-lm.vercel.app/api/trigger-sync` (mesmo `CRON_SECRET`). CONFIRMAR se existe — o sync agendado principal é GitHub Actions no repo `diegocap2212/locavia-dashboard` e grava direto no Blob (não é afetado pelo cutover).
6. Supabase: remover origens antigas da redirect allowlist (OTP por código — impacto nulo).

## Infra/envs já feitas no neo-lm

- Production: `VITE_SUPABASE_*` (pré-existentes), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SESSION_SECRET` (novo, 32B), `ALLOWED_ORIGIN`, `TOWER_PASSWORD` (gerada). Preview: bug do CLI (`git_branch_required`) impediu env add não-interativo — a validação foi via staging `--skip-domain` (usa envs de Production).
- **Protection Bypass for Automation** habilitado no neo-lm (testes HTTP em deployments SSO-protegidos): header `x-vercel-protection-bypass`.
- Raiz linkada ao projeto neo-lm (`.vercel/`); `neo-hub/.vercel` antigo ainda existe (limpar).

## Staging validado (2026-07-14)

`GET /` 200 (hub) · `/dash/`, `/maturity/`, rotas profundas e ASSETS → 302 `/?next=` · `/api/data` 401 sem Bearer · `POST /api/session` 401 · `GET /api/tower` 401 · HMAC Node↔WebCrypto testado (válido/expirado/adulterado/secret errado). Falta só o leg logado (item 2 acima).

## Pendências pós-cutover

1. **Roles do MMA (decisão do Diego):** SM enxerga/gerencia SÓ os próprios squads; Diego = admin global. Exige RLS novas + ajustes no AdminMMA. (Novos SMs chegando.)
2. **E-mail OTP:** mitigado (código no assunto, remetente "NEO — LM Mobilidade", OTP 1h, reenvio com cooldown no hub). Definitivo = Resend: 3 registros DNS em lmmobilidade.com.br pendentes + trocar SMTP (hoje Gmail pessoal).
3. **Rotacionar segredos que passaram pelo chat:** token Supabase `sbp_a5f2...` (2026-07-14), senha de app do Gmail, API key antiga do Resend.
4. Fase 3c: remover ramo cookie legado (`dash_session`/`DASHBOARD_PASSWORD`) das functions + `openapi.ts`.
5. `.env.example` dos apps ainda citam `VITE_HUB_URL`/`VITE_MMA_ORIGIN` (não usados mais) — limpar.

## Pegadinhas

- `supabase config push` reseta `[auth]` — config SMTP/allowlist foi via Management API.
- Deploy do portal: NUNCA `npm run build` do dash no build composto (roda sync:sfmkt e exige credenciais) — o script usa `tsc -b && vite build`.
- `vercel env add NAME preview --value X --yes` está quebrado no CLI 54 (catch-22 `git_branch_required`); usar o dashboard ou API com PAT.
- Redis (Upstash) usado por `api/comments.ts`. `verifyBearer` duplicado inline nas functions de propósito (Vercel não bundleia imports entre functions).
- Sem `SESSION_SECRET` o middleware é fail-open (paridade com dev) — obrigatória em produção.
