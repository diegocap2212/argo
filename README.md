# ARGO — Venice by Blite × LM Mobilidade

Monorepo do **ARGO**, o ponto único de entrada para as aplicações digitais da parceria Venice/LM Mobilidade:

| App | Pasta | O que é | Produção |
|---|---|---|---|
| **ARGO Hub** | [`argo-hub/`](argo-hub/) | Landing page de entrada. Faz o login (Microsoft) e dá acesso às duas aplicações. | projeto Vercel `argo-hub` |
| **Performance Dash** | [`locavia-dashboard/`](locavia-dashboard/) | Dashboard de performance da operação: fluxo, entrega e previsibilidade por time/período, com dados do Jira e Salesforce Marketplace. | https://locavia-dashboard.vercel.app |
| **Maturity Model (Portal MMA)** | [`maturitymodel/`](maturitymodel/) | Modelo de Maturidade Ágil: ciclos trimestrais de avaliação por squad (sessão → homologação → oficialização → plano de kaizens). | https://maturitymodel-ashen.vercel.app |

## Arquitetura

```
                        ┌─────────────────────────────┐
  usuário ───────────►  │  ARGO Hub (Vite estático)   │
  @lmmobilidade.com.br  │  login "Entrar c/ Microsoft" │
                        └──────────┬──────────────────┘
                                   │ Supabase Auth (provider Azure/Entra ID,
                                   │ single-tenant lmmobilidade.com.br)
                 ┌─────────────────┴──────────────────┐
                 ▼                                    ▼
  ┌───────────────────────────┐        ┌──────────────────────────────┐
  │ Performance Dash          │        │ Portal MMA                   │
  │ React 19 + Vite + Vercel  │        │ React 18 + Vite + Supabase   │
  │ Functions (api/*)         │◄─embed─│ (Postgres + RLS + Edge Fn)   │
  │ validam JWT do Supabase   │ iframe │ /s/:id/metricas              │
  └───────────┬───────────────┘        └───────────┬──────────────────┘
              │                                    │
   Jira + SFMKT ──► sync/ ──► Vercel Blob          │ Jira ──► Edge Function
   (GitHub Action + cron)     └► GET /api/data     │ sync-anchors ──► anchor_readings
                                                   └► Postgres (Supabase)
```

### Autenticação (visão única)

- **Identidade:** projeto Supabase compartilhado (`cvkcngrmnfwupstyrpsd`) com provider **Azure (Microsoft Entra ID)**, registrado como app *single-tenant* — **somente contas @lmmobilidade.com.br** conseguem entrar. Qualquer conta do tenant se auto-cadastra no primeiro login (cria o usuário no Supabase automaticamente).
- **Hub:** única tela de login visível ("Entrar com Microsoft"). Após logar, mostra as duas "portas".
- **Apps:** não têm tela de login. Sem sessão local, disparam o OAuth do Azure automaticamente — como a sessão Microsoft já existe no navegador, o retorno é silencioso (SSO via IdP; cada origem Vercel mantém sua própria sessão Supabase em `localStorage`).
- **Backend do Performance Dash:** as functions (`api/data`, `api/refresh`, `api/comments`) exigem `Authorization: Bearer <access_token do Supabase>` e validam o token contra `GET {SUPABASE_URL}/auth/v1/user`.
- **Portal MMA:** autorização fina por papel (`po/tl/sm/am/team`) via tabela `squad_members` + RLS no Postgres. Usuário novo sem squad vê o onboarding e o Guia; papéis são atribuídos pelo AM em `/admin`.
- **Iframe de métricas (MMA → Dash):** OAuth não roda dentro de iframe; o MMA envia a própria sessão Supabase ao iframe via `postMessage` (`type: 'argo:session'`) e o Dash em modo embed (`?embed=1`) chama `supabase.auth.setSession()`.

### Fluxo de dados

- **Performance Dash:** scripts em `locavia-dashboard/sync/` coletam Jira Grupo LM + SFMKT → gravam dataset no **Vercel Blob** privado → `GET /api/data` serve ao front (cache + ETag; fallback versionado em `src/data.json`). Cadência: cron externo chama `/api/trigger-sync` → dispara GitHub Action `hourly-sync.yml` → sync + commit de `sfmkt_data.json`/`src/data-meta.json` → redeploy. Comentários em Redis (Upstash).
- **Portal MMA:** todo o estado vive no Postgres do Supabase (acesso direto do front via `supabase-js`, protegido por RLS). Métricas objetivas do Jira entram pela Edge Function `sync-anchors` (secrets só no Supabase).

## Rodando localmente

```bash
# Performance Dash (porta 5173) — sem envs roda com dados do fallback e gate desativado
cd locavia-dashboard && npm install && npm run dev

# Portal MMA (porta 8080) — requer .env com VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
cd maturitymodel && npm install && npm run dev

# ARGO Hub (porta 5173) — mesmas envs VITE_SUPABASE_*
cd argo-hub && npm install && npm run dev
```

Cada app tem `.env.example` com as variáveis documentadas.

## Deploy

Três projetos na **Vercel**, todos apontando para este repositório com *Root Directory* distinto (`argo-hub`, `locavia-dashboard`, `maturitymodel`). Push na `main` faz deploy dos três.

Variáveis por projeto (produção):

| Projeto | Variáveis |
|---|---|
| argo-hub | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| locavia-dashboard | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, `CRON_SECRET` |
| maturitymodel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Infra externa: **Supabase** (banco, auth e Edge Function do MMA), **Azure/Entra ID** (App Registration "ARGO (Supabase SSO)" — client secret expira e precisa de rotação, ver data no App Registration), **Vercel Blob + Upstash Redis** (dados do Dash), **cron-job.org** (gatilho do sync).

## Documentação por app

- `locavia-dashboard/README.md` — arquitetura detalhada do Dash · `CLAUDE.md` — invariantes de engenharia · `DESIGN.md` — identidade visual
- `maturitymodel/ARCHITECTURE.md` — doc técnica completa do MMA · `docs/` — modelo de conteúdo e especificações
- `argo-hub/` — landing (a identidade visual do hub vive no próprio `index.html`)
