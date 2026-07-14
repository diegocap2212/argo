# NEO — Núcleo de Evolução e Operação · Venice by Blite × LM Mobilidade

Monorepo do **Portal NEO**: as três aplicações da parceria Venice/LM Mobilidade servidas numa **única origem** (`https://neo-lm.vercel.app`), com login único e acesso garantido só pelo hub.

| App | Pasta | Rota em produção | O que é |
|---|---|---|---|
| **NEO Hub** | [`neo-hub/`](neo-hub/) | `/` | Login (Magic Link/OTP) + portas para as aplicações. |
| **Performance Dash** | [`locavia-dashboard/`](locavia-dashboard/) | `/dash/**` | Fluxo, entrega e previsibilidade por time/período (Jira + SFMKT). |
| **Maturity Model (Portal MMA)** | [`maturitymodel/`](maturitymodel/) | `/maturity/**` | Ciclos de avaliação de maturidade por squad. |

As functions serverless vivem em [`api/`](api/) na raiz (`/api/**`) e o [`middleware.ts`](middleware.ts) protege as rotas das apps na borda.

## Arquitetura (portal de origem única)

```
                    neo-lm.vercel.app (1 projeto Vercel)
  usuário ──► /            NEO Hub — login OTP + portas (público)
              /dash/**     Performance Dash ─┐  bloqueados na borda pelo
              /maturity/** Portal MMA       ─┤  middleware.ts sem o cookie
              /api/**      functions (Bearer + allowlist; fora do middleware)
                                             │
  login no hub ──► POST /api/session ──► cookie neo_session (HMAC 12h, HttpOnly)
```

- **Build composto** (`scripts/build-portal.mjs`): cada app é um Vite independente; o hub builda com base `/`, o Dash com `--base=/dash/`, o MMA com `--base=/maturity/`, e os três `dist/` são compostos em um só. **Sem npm workspaces de propósito** (hoisting aninhava o rollup e o npm derrubava o binário linux — npm#4828); na Vercel cada app roda `npm ci` com o próprio lockfile.
- **Sessão única:** mesma origem ⇒ mesmo `localStorage` ⇒ a sessão Supabase criada no hub vale nas três apps. O antigo handoff por fragment (`#neo_at`) e o `postMessage` do iframe **não existem mais**.
- **Acesso só pelo NEO (server-side):** após o login o hub chama `POST /api/session` (valida Bearer + RPC `is_neo_allowed`) que emite o cookie **`neo_session`** (HMAC-SHA256, 12h). O `middleware.ts` (Edge, Web Crypto) exige esse cookie para servir **qualquer coisa** sob `/dash` e `/maturity` — HTML e assets; sem ele, 302 para `/?next=<destino>` e o hub retoma o destino após o login. Logout (hub e apps) faz `DELETE /api/session`.
- **Torre restrita:** o comparativo entre agilistas (`/dash/torre`) tem trava adicional por senha — `api/tower.ts` valida a env `TOWER_PASSWORD` server-side e emite o cookie `neo_tower` (12h). Nada de segredo no bundle.
- **Autorização:** allowlist NEO no Postgres — `is_neo_allowed()` libera `@lmmobilidade.com.br` + exceções em `neo_access` (migração em `maturitymodel/supabase/migrations/20260713120000_neo_access_allowlist.sql`). Papéis do MMA (`po/tl/sm/am/team`) via `squad_members` + RLS.
- **Iframe de métricas (MMA → Dash):** same-origin (`/dash/time/:id?embed=1`) — compartilha a sessão pelo localStorage; `?embed=1` é só flag de layout. CSP `frame-ancestors 'self'`.

### Fluxo de dados

- **Performance Dash:** `locavia-dashboard/sync/` coleta Jira + SFMKT → **Vercel Blob** privado → `GET /api/data` (Bearer; fallback versionado em `locavia-dashboard/src/data.json`). Comentários em Redis (Upstash). Cron externo chama `/api/trigger-sync` (secret próprio `CRON_SECRET`).
- **Portal MMA:** Postgres do Supabase via RLS; âncoras do Jira pela Edge Function `sync-anchors`.

## Rodando localmente

Cada app continua standalone (base `/`, sem middleware):

```bash
cd locavia-dashboard && npm install && npm run dev   # porta 5173; sem envs = fallback + auth aberto
cd maturitymodel     && npm install && npm run dev   # porta 8080; requer VITE_SUPABASE_*
cd neo-hub           && npm install && npm run dev   # requer VITE_SUPABASE_*
```

O portal composto valida-se com `npm run build:portal` (raiz). O teste funcional de middleware+functions é feito em deployment da Vercel (staging via `vercel deploy --target=production --skip-domain`), nunca com `vercel dev`.

## Deploy

**Um único projeto Vercel (`neo-lm`)**, deployado da **raiz** do monorepo via CLI (`vercel deploy`); Git desconectado. `vercel.json` define `buildCommand`, rewrites por prefixo e headers.

Variáveis (Production e Preview):

| Grupo | Variáveis |
|---|---|
| Build dos apps | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Functions (auth) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Middleware/Torre | `SESSION_SECRET` (obrigatória em produção — sem ela o gate abre), `TOWER_PASSWORD` |
| Dados | `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| Sync | `CRON_SECRET`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, `GITHUB_WORKFLOW`, `GITHUB_REF` |
| CORS | `ALLOWED_ORIGIN=https://neo-lm.vercel.app` |

**Não** configurar `DASHBOARD_PASSWORD` (ramo legado de cookie, propositalmente inerte). Os projetos Vercel antigos (`locavia-dashboard`, `maturitymodel`) servem apenas redirects 308 para `/dash` e `/maturity`.

Infra externa: **Supabase** (auth + Postgres + Edge Function), **Vercel Blob + Upstash Redis**, **GitHub Actions** (sync agendado no repo `diegocap2212/locavia-dashboard`, grava direto no Blob).

## Documentação por app

- `locavia-dashboard/README.md` · `CLAUDE.md` · `DESIGN.md`
- `maturitymodel/ARCHITECTURE.md` · `docs/`
- `neo-hub/` — landing (identidade no próprio `index.html`)
- `HANDOFF.md` — estado operacional corrente (ler antes de trabalhar)
