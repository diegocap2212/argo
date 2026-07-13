# NEO — Núcleo de Evolução e Operação · Venice by Blite × LM Mobilidade

Monorepo do **NEO**, o ponto único de entrada para as aplicações digitais da parceria Venice/LM Mobilidade:

| App | Pasta | O que é | Produção |
|---|---|---|---|
| **NEO Hub** | [`neo-hub/`](neo-hub/) | Landing page de entrada. Faz o login (Magic Link) e dá acesso às aplicações. | projeto Vercel do hub |
| **Performance Dash** | [`locavia-dashboard/`](locavia-dashboard/) | Dashboard de performance da operação: fluxo, entrega e previsibilidade por time/período, com dados do Jira e Salesforce Marketplace. | https://locavia-dashboard.vercel.app |
| **Maturity Model (Portal MMA)** | [`maturitymodel/`](maturitymodel/) | Modelo de Maturidade Ágil: ciclos trimestrais de avaliação por squad (sessão → homologação → oficialização → plano de kaizens). | https://maturitymodel-ashen.vercel.app |

## Arquitetura

```
                        ┌─────────────────────────────┐
  usuário ───────────►  │  NEO Hub (Vite estático)    │
  @lmmobilidade.com.br  │  login "Magic Link" (e-mail) │
                        └──────────┬──────────────────┘
                                   │ Supabase Auth (e-mail OTP) + allowlist NEO
                                   │ handoff de sessão via fragment (#neo_at/#neo_rt)
                 ┌─────────────────┴──────────────────┐
                 ▼                                    ▼
  ┌───────────────────────────┐        ┌──────────────────────────────┐
  │ Performance Dash          │        │ Portal MMA                   │
  │ React 19 + Vite + Vercel  │        │ React 18 + Vite + Supabase   │
  │ Functions (api/*)         │◄─embed─│ (Postgres + RLS + Edge Fn)   │
  │ validam JWT + allowlist   │ iframe │ /s/:id/metricas              │
  └───────────┬───────────────┘ (post- └───────────┬──────────────────┘
              │                 Message)            │
   Jira + SFMKT ──► sync/ ──► Vercel Blob           │ Jira ──► Edge Function
   (GitHub Action + cron)     └► GET /api/data      │ sync-anchors ──► anchor_readings
                                                    └► Postgres (Supabase)
```

### Autenticação e autorização

- **Identidade:** projeto Supabase compartilhado (`cvkcngrmnfwupstyrpsd`). O login é **Magic Link (e-mail OTP)** e acontece **só no hub**.
- **Autorização (allowlist NEO):** a função Postgres `is_neo_allowed()` é a fonte da verdade — libera qualquer e-mail **@lmmobilidade.com.br** e as exceções aprovadas na tabela `neo_access` (gerenciadas pelo admin no dashboard Supabase). Migração: `maturitymodel/supabase/migrations/20260713120000_neo_access_allowlist.sql`.
- **Apps sem tela de login:** sem sessão, o Dash e o Portal **redirecionam ao hub**. Como hub e apps são origens Vercel distintas (localStorage não é compartilhado), o hub faz **handoff da sessão** ao abrir uma app: passa os tokens no fragment da URL (`#neo_at=…&neo_rt=…`), que a app consome via `setSession()` e limpa em seguida.
- **Backend do Performance Dash:** as functions (`api/data`, `api/refresh`, `api/comments`) exigem `Authorization: Bearer <access_token>` e validam **autenticação + allowlist** numa só chamada ao RPC `is_neo_allowed`. Durante a transição também aceitam o cookie HMAC legado.
- **Portal MMA:** autorização fina por papel (`po/tl/sm/am/team`) via `squad_members` + RLS. **Papéis são atribuídos manualmente** pelo AM em `/admin` (por e-mail). Usuário novo sem squad vê o onboarding e o Guia.
- **Iframe de métricas (MMA → Dash):** o MMA envia a própria sessão ao iframe via `postMessage` (`type: 'neo:session'`, origin validado) e o Dash em modo embed (`?embed=1`) chama `supabase.auth.setSession()`.

### Fluxo de dados

- **Performance Dash:** scripts em `locavia-dashboard/sync/` coletam Jira Grupo LM + SFMKT → gravam dataset no **Vercel Blob** privado → `GET /api/data` serve ao front (cache + ETag; fallback em `src/data.json`). Cadência: cron externo chama `/api/trigger-sync` → dispara a GitHub Action `hourly-sync.yml`. Comentários em Redis (Upstash).
- **Portal MMA:** todo o estado vive no Postgres do Supabase (via `supabase-js` + RLS). Métricas objetivas do Jira entram pela Edge Function `sync-anchors`.

## Rodando localmente

```bash
# Performance Dash (porta 5173) — sem envs roda com dados do fallback e auth fail-open
cd locavia-dashboard && npm install && npm run dev

# Portal MMA (porta 8080) — requer .env com VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
cd maturitymodel && npm install && npm run dev

# NEO Hub (porta 5173) — mesmas envs VITE_SUPABASE_*
cd neo-hub && npm install && npm run dev
```

## Deploy

Três projetos na **Vercel** apontando para este repositório com *Root Directory* distinto (`neo-hub`, `locavia-dashboard`, `maturitymodel`). Push na `main` faz deploy.

| Projeto | Variáveis |
|---|---|
| neo-hub | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| locavia-dashboard | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_HUB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, `CRON_SECRET` |
| maturitymodel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_HUB_URL` |

`VITE_HUB_URL` = URL do hub (default no código: `https://neo-hub.vercel.app`). Ajustar para a URL real do projeto do hub.

Pré-requisito do deploy das apps: **aplicar a migração `neo_access` no Supabase antes** de configurar `SUPABASE_URL`/`SUPABASE_ANON_KEY` no locavia (senão o RPC `is_neo_allowed` retorna 404 e o gate nega).

Infra externa: **Supabase** (banco, auth e Edge Function do MMA), **Vercel Blob + Upstash Redis** (dados do Dash), **cron-job.org** (gatilho do sync).

## Documentação por app

- `locavia-dashboard/README.md` · `CLAUDE.md` · `DESIGN.md`
- `maturitymodel/ARCHITECTURE.md` · `docs/`
- `neo-hub/` — landing (identidade no próprio `index.html`)
