# HANDOFF — NEO (Núcleo de Evolução e Operação)

> Plano corrente: `C:\Users\Usuario\.claude\plans\fable-precisamos-sincronizar-essas-frolicking-rainbow.md` (Portal unificado).
> **Estado (2026-07-14): PORTAL UNIFICADO NO AR — cutover concluído.** `https://neo-lm.vercel.app` serve hub (`/`), Dash (`/dash`) e MMA (`/maturity`); domínios antigos respondem 308 para as rotas novas.

## Portal único (arquitetura nova)

- **1 projeto Vercel (`neo-lm`), deploy da RAIZ do monorepo.** Hub em `/`, Dash em `/dash/**`, MMA em `/maturity/**`, functions em `/api/**` (movidas da pasta do dash para a raiz), `middleware.ts` (Edge) na raiz.
- **Build composto:** `npm run build:portal` (`scripts/build-portal.mjs`) — 3 Vite builds (`--base=/dash/`, `--base=/maturity/`) compostos em `dist/`. **SEM npm workspaces** (hoisting quebrava binário linux do rollup — npm#4828); na Vercel cada app roda `npm ci` com o próprio lock.
- **Auth same-origin:** sessão Supabase única no localStorage da origem. Fragment handoff (`#neo_at`) e postMessage do iframe REMOVIDOS. Iframe Metricas → `/dash/time/:id?embed=1` same-origin.
- **Gate server-side:** login no hub → `POST /api/session` → cookie `neo_session` (HMAC, 12h, HttpOnly). `middleware.ts` exige o cookie para TUDO sob `/dash`/`/maturity` (HTML+assets); sem ele → 302 `/?next=`. Hub segue `?next` interno após login. Logout = `DELETE /api/session` (hub, dash e MMA).
- **Torre restrita:** `/dash/torre` (comparativo SM×SM/time×time, saiu da home) — senha na env `TOWER_PASSWORD` validada em `api/tower.ts` → cookie `neo_tower` 12h. Senha de produção gerada em 2026-07-14 (mostrada 1x ao Diego).

## Cutover — CONCLUÍDO (2026-07-14)

1. ✅ Envs copiadas do projeto antigo → neo-lm Production: `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. **`CRON_SECRET` e `GITHUB_*` estavam VAZIAS no projeto antigo** — trigger-sync/refresh-dispatch nunca estiveram ativos; não há cron externo a migrar (o sync é GitHub Actions no repo antigo, grava direto no Blob).
2. ✅ Diego testou o staging logado (login OTP → doors → apps → Torre) e aprovou.
3. ✅ `vercel deploy --target=production --skip-domain` (dpl neo-121l8d5u8) + smoke → `vercel promote` — domínio virado.
4. ✅ Redirects 308 publicados nos 2 projetos antigos (pastas `redirects/*`; incluem regra explícita para `/` — o matcher `/:path*` não casa a raiz).
5. Supabase: allowlist de redirect com origens antigas — inócua (OTP por código); limpar quando conveniente.

## Infra/envs já feitas no neo-lm

- Production: `VITE_SUPABASE_*` (pré-existentes), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SESSION_SECRET` (novo, 32B), `ALLOWED_ORIGIN`, `TOWER_PASSWORD` (gerada). Preview: bug do CLI (`git_branch_required`) impediu env add não-interativo — a validação foi via staging `--skip-domain` (usa envs de Production).
- **Protection Bypass for Automation** habilitado no neo-lm (testes HTTP em deployments SSO-protegidos): header `x-vercel-protection-bypass`.
- Raiz linkada ao projeto neo-lm (`.vercel/`); `neo-hub/.vercel` antigo ainda existe (limpar).

## Staging validado (2026-07-14)

`GET /` 200 (hub) · `/dash/`, `/maturity/`, rotas profundas e ASSETS → 302 `/?next=` · `/api/data` 401 sem Bearer · `POST /api/session` 401 · `GET /api/tower` 401 · HMAC Node↔WebCrypto testado (válido/expirado/adulterado/secret errado). Falta só o leg logado (item 2 acima).

## Incidente do hourly-sync (2026-07-14/15) — RESOLVIDO

O cutover matou o gatilho do sync: cron-job.org chamava `locavia-dashboard.vercel.app/api/trigger-sync`,
que virou redirect 308 (function não existe mais lá). **Fix aplicado:** `schedule: */30 * * * *` nativo
restaurado no workflow do repo `diegocap2212/locavia-dashboard` (commit `7692648`) — sync autossuficiente,
sem cron externo. Run manual de validação: success (2026-07-15T00:23Z). O job do cron-job.org pode ser
DESATIVADO na conta do Diego (hoje só recebe 308). `/api/trigger-sync` no portal segue fail-closed sem
`CRON_SECRET` — sem função ativa; remover na Fase 3c se ninguém for usá-lo.

## Planos para execução apartada (2026-07-14)

- `docs/QA-PLAN.md` — code review profundo + matriz de testes + debug/observabilidade + aceite.
- `docs/SECURITY-PLAN.md` — cybersecurity (insider/offboarding/segredos/headers/supply chain).
- `maturitymodel/docs/ROLES-REDESIGN.md` — SM por squad + admin global; tem 4 QUESTÕES ABERTAS para o Diego (§5) antes de implementar.
- Achados já conhecidos aguardando correção (estão nos planos): `frame-ancestors` só no `/dash` (hub/maturity sem anti-clickjacking), Torre sem rate-limit de senha, policies legadas de `teams` no MMA, monorepo sem espelho remoto (backup!).

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
