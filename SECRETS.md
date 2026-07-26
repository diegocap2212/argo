# Segredos e variáveis — inventário

**Este arquivo nunca contém valores.** Ele diz o que existe, para que serve, onde buscar e
quem rotaciona. Valores vivem só nos projetos Vercel e nos consoles dos provedores.

> Envs de Production na Vercel são **Sensitive**: write-only. `vercel env pull` as devolve
> **vazias**. Isso não é bug — é o motivo de este inventário existir em vez de um `.env` de
> referência.

## Projeto Vercel `neo-lm` (portal: hub, Dash, Maturity, functions, middleware)

| Variável | Para quê | Onde obter | Se faltar em produção |
|---|---|---|---|
| `SESSION_SECRET` | Assina `neo_session`, `neo_tower`, `neo_nero` | gerar 32B; **tem de ser idêntico no `nero-portal`** | middleware 503 (fail-closed) |
| `TOWER_PASSWORD` | Senha da Torre (`/dash/torre`) | gerada; rotacionada em 2026-07-15 | `/api/gate?scope=tower` 503 |
| `NERO_PASSWORD` | Senha do Nero (`/nero`) | gerada em 2026-07-26 | `/api/gate?scope=nero` 503 |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Functions validam Bearer via RPC `is_neo_allowed` | console Supabase | `/api/data` 401 (fail-closed) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Build dos apps (chave pública; a segurança real é RLS/JWT) | idem | hub não faz login |
| `BLOB_READ_WRITE_TOKEN` | Dataset do Jira no Vercel Blob | Vercel → Storage | `/api/data` cai no fallback versionado |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis: comentários + rate-limit do gate | Vercel → Storage | gate 503; comentários falham |
| `ALLOWED_ORIGIN` | CORS de `/api/comments` | `https://neo-lm.vercel.app` | CORS bloqueia |
| `CRON_SECRET`, `GITHUB_*` | `/api/trigger-sync` (inerte — o sync roda por Actions no repo do Dash) | — | 401, sem efeito prático |

## Projeto Vercel `nero-portal`

| Variável | Para quê | Se faltar |
|---|---|---|
| `SESSION_SECRET` | Verifica `neo_session`/`neo_nero`. **Idêntico ao do `neo-lm`** | proxy 503; se divergente, rejeita toda sessão |
| `NEO_ORIGIN` | Para onde o proxy devolve quem não tem sessão | cai no default `https://neo-lm.vercel.app` |
| `ANTHROPIC_API_KEY` | O motor. Único ponto de IA (`lib/nero/core.ts`) | chat/report 500 |
| `POSTGRES_PRISMA_URL` | Postgres pooled (runtime) | app não sobe |
| `DATABASE_URL_UNPOOLED` | Postgres direto (migrations) | migration falha |
| `NERO_MONTHLY_BUDGET_USD` | Teto mensal — **freio de verdade**, não só medidor | default US$ 20 |
| `NERO_MODEL` | Sobrescreve o modelo padrão (allowlist em `core.ts`) | usa Haiku 4.5 |
| `DEMO_SEED_ALLOWED` | Libera o seed de demo | seed aborta (**é o desejado em produção**) |

`APP_PASSWORD` foi **removida** em 2026-07-26 (login próprio do Nero morreu). Não reintroduzir.
`DASHBOARD_PASSWORD` idem, no Dash.

## Provedores

| Serviço | O que hospeda | Console |
|---|---|---|
| Vercel | os 2 projetos, Blob, integrações | `vercel.com/diegocaporusso-2820s-projects` |
| Supabase | auth + Postgres + RLS do NEO (`cvkcngrmnfwupstyrpsd`) | `supabase.com/dashboard` |
| Neon | Postgres do Nero — projeto `neon-celeste-globe` (`frosty-star-37790121`) | `console.neon.tech` |
| Upstash | Redis (comentários, rate-limit) | via Vercel → Storage |
| Anthropic | Claude API | `platform.claude.com` |
| GitHub | `diegocap2212/argo` (fonte de verdade) | — |

**Como descobrir qual recurso Neon pertence a um projeto** (o `NEON_PROJECT_ID` é write-only):

```bash
vercel integration list      # mostra o recurso ligado ao projeto
```

## Branches do Neon (projeto do Nero)

| Branch | Papel |
|---|---|
| `main` | produção |
| `preview` | criada 2026-07-26 para validar migrations fora de produção |
| `backup-pre-v2` | backup do ritual da v2 |
| `backup-pre-migrate-baseline` | backup antes do baseline de migrations (2026-07-26) |

## Rotação

**Rotina anual, ou imediata em suspeita de exposição.**

| Segredo | Efeito da rotação |
|---|---|
| `SESSION_SECRET` | Atualizar nos **dois** projetos e redeployar ambos. Todos refazem login (OTP); Torre e Nero pedem senha de novo |
| `TOWER_PASSWORD` / `NERO_PASSWORD` | Quem tinha acesso digita a nova. Sem outro efeito |
| `ANTHROPIC_API_KEY` | Chat e report param até atualizar |
| Chaves Supabase / Blob / Upstash | Rotacionar no provedor e refletir na Vercel |

Rotina: gerar → `vercel env rm` → `vercel env add` → **redeployar** (env só vale no próximo
deploy) → verificar.

> ⚠️ **`vercel env rm NOME preview` apaga a variável INTEIRA**, produção incluída — não só o
> target preview. Como produção é write-only, você não recupera o valor. Antes de qualquer
> `env rm` em variável multi-target, garanta que o valor é reconstituível (para URLs de banco,
> por exemplo, `neonctl connection-string <branch>`).

## Pendências de rotação (herdadas)

Do `HANDOFF.md`, ainda em aberto e só o Diego pode fazer:

- Tokens Supabase `sbp_a5f2…` (2026-07-14) e `sbp_6ac9…` (2026-07-15) — revogar em
  `supabase.com/dashboard/account/tokens`
- Senha de app do Gmail e API key antiga do Resend
- 2FA nas contas (Vercel / GitHub / Supabase / cron-job.org)
- Escopo do `GITHUB_DISPATCH_TOKEN`

## Regras

1. Segredo **nunca** em código, commit, chat, issue ou log.
2. `.gitignore` cobre `.env*` com exceção do `.env.example` — mas confira antes de criar
   arquivo novo de credencial.
3. Logs registram **quem** acessou (e-mail), nunca o segredo. `api/gate.ts` loga o e-mail de
   quem abriu a Torre/o Nero via `console.log` — visível em `vercel logs`, nunca em resposta
   HTTP.
4. Repositório **privado**. O `SECURITY-PLAN.md` registra um caso de repo que virou público com
   dado real do Jira dentro.
