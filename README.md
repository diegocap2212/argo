# NEO — Núcleo de Evolução e Operação · Venice by Blite × LM Mobilidade

> **Assumindo o projeto?** [`ARCHITECTURE.md`](ARCHITECTURE.md) (o mapa e o que é
> load-bearing) → [`ONBOARDING.md`](ONBOARDING.md) (do zero ao deploy) →
> [`SECRETS.md`](SECRETS.md) (variáveis) → [`HANDOFF.md`](HANDOFF.md) (estado corrente).
>
> **Operando?** [`OPERATIONS.md`](OPERATIONS.md) — runbooks: suíte de verificação, sync bloqueado,
> gate em 503, orçamento do Nero, migrations, deploy, e o que só um operador fecha.
>
> **Avaliando segurança?** [`SECURITY.md`](SECURITY.md) — cada garantia com **onde é imposta** e
> **qual teste a prova**, mais a lista honesta do que ainda não tem garantia.
>
> **Assumindo a operação (handover)?** [`TRANSFERENCIA.md`](TRANSFERENCIA.md) — runbook em 4
> fases: transferir a propriedade, criar as credenciais novas, revogar as antigas e **provar que
> morreram**. Nenhum valor de credencial escrito; só onde, quem e em que ordem.
>
> **Vai mudar de nuvem ou de banco?** [`PORTABILIDADE.md`](PORTABILIDADE.md) — o que prende o
> NEO ao Supabase e à Vercel, medido; e **o que quebra no dado ao migrar**. Leia antes de
> exportar qualquer coisa: os vínculos de squad saem errados se exportados pelo caminho óbvio.

Monorepo do **Portal NEO**: as cinco aplicações da parceria Venice/LM Mobilidade servidas numa **única origem** (`https://neo-lm.vercel.app`), com login único e acesso garantido só pelo hub.

| App | Pasta | Rota em produção | O que é |
|---|---|---|---|
| **NEO Hub** | [`neo-hub/`](neo-hub/) | `/` | Login (Magic Link/OTP) + portas para as aplicações. |
| **Performance Dash** | [`locavia-dashboard/`](locavia-dashboard/) | `/dash/**` | Fluxo, entrega e previsibilidade por time/período (Jira + SFMKT). |
| **Maturity Model (Portal MMA)** | [`maturitymodel/`](maturitymodel/) | `/maturity/**` | Ciclos de avaliação de maturidade por squad. |
| **Administração** | [`neo-admin/`](neo-admin/) | `/admin/**` | Pessoas, papéis e a matriz papel × função do NEO. |
| **Nero** | [`nero-portal/`](nero-portal/) | `/nero/**` | Advisor de governança de dados (DAMA). **Acesso restrito** por permissão. |

As functions serverless vivem em [`api/`](api/) na raiz (`/api/**`) e o [`middleware.ts`](middleware.ts) protege as rotas das apps na borda.

## Arquitetura (portal de origem única)

**Uma origem pública, DOIS projetos Vercel.** `neo-lm` serve o hub, o Dash, o MMA, a
Administração e as functions; `nero-portal` é um projeto separado, alcançado por rewrite.
*(Este README afirmava "1 projeto Vercel" — contradizendo `ARCHITECTURE.md`, `ONBOARDING.md` e o
próprio `vercel.json`. Era o achado NEO-006 da revisão de 2026-07-31, e a consequência prática
era um operador deployar metade do portal.)*

```
                    neo-lm.vercel.app (projeto Vercel: neo-lm)
  usuário ──► /            NEO Hub — login OTP + portas (por permissão)
              /dash/**     Performance Dash ─┐  bloqueados na borda pelo
              /maturity/** Portal MMA       ─┤  middleware.ts: sessão +
              /admin/**    Administração    ─┤  a PERMISSÃO da porta
              /nero/**     Nero ── rewrite p/ projeto Vercel `nero-portal` ─┘
              /api/**      functions (Bearer/segredo; fora do middleware)
                                             │
  login no hub ──► POST /api/session ──► cookie neo_session (HMAC 12h, HttpOnly, com claims)
```

- **Autorização é dado, não código:** `has_perm(permissao, squad)` no Postgres, com a matriz
  papel × função em `neo_role_permissions` — editável em `/admin`. A borda faz **pré-filtro**
  pelas claims do cookie; o ponto do dado decide de verdade (RLS, `/api/data`, `/api/authz`).
  Ver `ARCHITECTURE.md`.
- **Build composto** (`scripts/build-portal.mjs`): cada app é um Vite independente; o hub builda com base `/`, o Dash com `--base=/dash/`, o MMA com `--base=/maturity/`, a Administração com `--base=/admin/`, e os quatro `dist/` são compostos em um só. **Cada linha roda o typecheck antes do `vite build`** — `vite build` sozinho transpila sem checar tipos, e era assim que o MMA gerava artefato apesar de erro de tipo (achado NEO-005).
- **Workspace pnpm** (`pnpm@11.17.0`, fixado em `packageManager`): um só lockfile (`pnpm-lock.yaml`) na raiz e `pnpm-workspace.yaml` declarando os apps e `packages/`. O `pnpm` NÃO está no PATH desta máquina — use `corepack pnpm`. *(Este README dizia até 2026-07-27 "sem npm workspaces de propósito … cada app roda `npm ci` com o próprio lockfile": era verdade antes da migração para pnpm e instruía procedimento que hoje não existe — não há nenhum `package-lock.json` no repo.)*
- **Sessão única:** mesma origem ⇒ mesmo `localStorage` ⇒ a sessão Supabase criada no hub vale nas três apps. O antigo handoff por fragment (`#neo_at`) e o `postMessage` do iframe **não existem mais**.
- **Acesso só pelo NEO (server-side):** após o login o hub chama `POST /api/session` (valida Bearer + RPC `is_neo_allowed`) que emite o cookie **`neo_session`** (HMAC-SHA256, 12h). O `middleware.ts` (Edge, Web Crypto) exige esse cookie para servir **qualquer coisa** sob `/dash` e `/maturity` — HTML e assets; sem ele, 302 para `/?next=<destino>` e o hub retoma o destino após o login. Logout (hub e apps) faz `DELETE /api/session`.
- **Torre e Nero por PERMISSÃO, não por senha (desde 31/07/2026):** o comparativo entre agilistas (`/dash/torre`) depende de `dash.tower.view`, resolvido server-side pelo `/api/data`; o Nero depende de `neo.nero.access`, perguntado pelo proxy dele ao `GET /api/authz` a cada navegação (memo de 60s ⇒ revogar corta o acesso em ≤1 min, sem novo login). `TOWER_PASSWORD` e `NERO_PASSWORD` saíram de uso; `api/gate.ts` ficou sem chamador e sai depois da janela de deploy. **Atenção:** o gate da Torre é de interface — o comparativo continua derivável do `/api/data` por quem quiser recalculá-lo. Ver `SECURITY.md` §6.
- **Propósito criptográfico nos tokens:** `neo_session`, `neo_tower` e o token do Nero são assinados com **subchaves HKDF-SHA256 distintas** derivadas de `SESSION_SECRET` (salt `neo-portal/token-subkey/v1`, `info` = propósito). Um token de sessão não verifica no gate da Torre porque a chave é outra — não porque um campo foi conferido. As três cópias autocontidas (`middleware.ts`, `api/gate.ts`, `api/session.ts`) e o pacote `packages/neo-auth` derivam igual.
- **Autorização:** allowlist NEO no Postgres — `is_neo_allowed()` libera **apenas** quem está aprovado em `neo_access` (migração original em `maturitymodel/supabase/migrations/20260713120000_neo_access_allowlist.sql`). **Desde 09/09/2026 não existe mais liberação por domínio:** `@lmmobilidade.com.br` deixou de conceder acesso com a saída da LM Mobilidade, e a allowlist virou a única porta — gerida em Administração → Acesso (`neo.access.manage`). Ver `20260909120000_remove_lm_domain_allowlist.sql`. Papéis do MMA (`po/tl/sm/am/team`) via `squad_members` + RLS.
- **Iframe de métricas (MMA → Dash):** same-origin (`/dash/time/:id?embed=1`) — compartilha a sessão pelo localStorage; `?embed=1` é só flag de layout. CSP `frame-ancestors 'self'`.

### Fluxo de dados

- **Performance Dash:** `locavia-dashboard/sync/` coleta Jira + SFMKT → **Vercel Blob** privado → `GET /api/data` (Bearer). Comentários em Redis (Upstash). O sync roda de hora em hora pelo **GitHub Actions** (`.github/workflows/hourly-sync.yml`), que grava no Blob e commita `src/data-meta.json`. Não existe mais endpoint de disparo: `/api/trigger-sync` e `/api/refresh` foram **removidos** (nunca estiveram ativos — as envs `CRON_SECRET`/`GITHUB_DISPATCH_TOKEN` nunca existiram no projeto `neo-lm`, então respondiam 503).
- **O fallback se declara.** `GET /api/data` responde `{items, syncedAt, source: 'blob'|'fallback', stale, count, hash}`. Quando o Blob falha e a resposta vem de `src/data.json`, `source: 'fallback'` e **`syncedAt: null`** — o fallback nunca empresta o timestamp de `data-meta.json` (que é commitado a cada hora e diria "fresco" sobre dado congelado). O ETag deriva de `source+hash+count+syncedAt`, não só do timestamp.
- **Contrato do dataset:** antes de publicar no Blob, `sync/dataset-contract.ts` checa o CONJUNTO contra o último sync (volume mínimo/máximo, queda >30%, time desaparecido, Key duplicada, datas impossíveis, drift de custom field, histórico parcial). Violação `bloqueia` aborta a publicação; `alerta` publica e avisa. Baseline em `src/data-baseline.json`.
- **Portal MMA:** Postgres do Supabase via RLS; âncoras do Jira por **duas** Edge Functions — `sync-anchors-user` (exige JWT de usuário + SM do squad ou AM/admin) e `sync-anchors-cron` (exige `ANCHOR_SYNC_CRON_SECRET` em header, do Vault). A antiga `sync-anchors` única, acionável com a anon key, não existe mais.

## Rodando localmente

Instalação **na raiz**, uma vez (workspace pnpm — não instale app por app):

```bash
corepack pnpm install --frozen-lockfile
```

Cada app continua standalone (base `/`, sem middleware):

```bash
corepack pnpm --filter locavia-dashboard dev   # porta 5173; sem envs = fallback + auth aberto
corepack pnpm --filter maturitymodel     dev   # porta 8080; requer VITE_SUPABASE_*
corepack pnpm --filter neo-hub           dev   # requer VITE_SUPABASE_*
```

O portal composto valida-se com `corepack pnpm build:portal` (raiz). O teste funcional de middleware+functions é feito em deployment da Vercel (staging via `vercel deploy --target=production --skip-domain`), nunca com `vercel dev`.

**Typecheck da raiz não é opcional.** `api/**` e `middleware.ts` — a borda que autentica todo o portal — ficaram sem verificação nenhuma até 2026-07-27, porque `pnpm -r` não inclui o projeto raiz e não havia `tsconfig.json` na raiz. Hoje `pnpm typecheck` roda `tsc -p tsconfig.json --noEmit` (borda) **e depois** `pnpm -r`.

## Deploy

**DOIS projetos Vercel**, e os dois precisam ser deployados:

| Projeto | O que contém | Comando |
|---|---|---|
| `neo-lm` | hub, Dash, MMA, Administração, `api/**`, `middleware.ts` | `vercel deploy --target=production --skip-domain` na **raiz** |
| `nero-portal` | o Nero (Next 16), servido por rewrite em `/nero` | idem, com `--local-config` (ver `ONBOARDING.md`) |

Git desconectado nos dois: **deploy é sempre explícito por CLI**, `main` ≠ produção. `vercel.json`
define `buildCommand`, rewrites por prefixo e headers.

⚠️ **Os dois na MESMA janela.** `SESSION_SECRET` é compartilhado e o contrato de sessão é único:
deployar só um lado deixa o outro rejeitando os cookies emitidos. Ordem: deploy nos dois → smoke
nos dois → `promote` nos dois.

Variáveis (Production e Preview):

| Grupo | Variáveis |
|---|---|
| Build dos apps | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Functions (auth) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Middleware/sessão | `SESSION_SECRET` (obrigatória em produção — **sem ela o gate FECHA**: 503) |
| Autorização | `NEO_AUTHZ_SECRET` (mesmo valor do segredo `neo_authz_secret` no Vault — sem ele o **Nero fecha**) |
| Dados | `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| CORS | `ALLOWED_ORIGIN=https://neo-lm.vercel.app` |

Sobre `SESSION_SECRET`: em **dev/preview**, ausência da env deixa passar (paridade com o gate das
functions, para rodar local sem segredo); em **produção** (`VERCEL_ENV=production`) responde **503**
([middleware.ts:110-118](middleware.ts#L110-L118)). Até 2026-07-27 este README dizia "sem ela o gate
abre" — nunca foi verdade em produção, e a frase convidava a tratar env sumida como degradação
tolerável em vez de incidente.

As variáveis de sync (`CRON_SECRET`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, `GITHUB_WORKFLOW`,
`GITHUB_REF`) **saíram do quadro**: nunca foram configuradas no `neo-lm` e os endpoints que as liam
foram removidos. O sync é agendado no GitHub Actions e usa os secrets **do repositório**
(`JIRA_*`, `BLOB_READ_WRITE_TOKEN`), não envs da Vercel.

**Não** configurar `DASHBOARD_PASSWORD` (ramo legado de cookie, propositalmente inerte). Os projetos Vercel antigos (`locavia-dashboard`, `maturitymodel`) servem apenas redirects 308 para `/dash` e `/maturity`.

Infra externa: **Supabase** (auth + Postgres + Edge Function), **Vercel Blob + Upstash Redis**, **GitHub Actions** (sync agendado no repo `diegocap2212/locavia-dashboard`, grava direto no Blob).

## Qualidade e segurança

- **`docs/QA-PLAN.md`** — plano de QA profundo (review + testes + debug/observabilidade); tem uma
  seção "Status final" no topo com o que já foi resolvido/verificado e o que segue pendente.
- **`docs/SECURITY-PLAN.md`** — plano de cybersecurity (modelo de ameaça, proteção de código/dados,
  segredos, supply chain); mesma estrutura de "Status final" no topo.
- **`docs/FULL-CODE-REVIEW-2026-07-27.md`** — review completo dos quatro apps (~60 achados), com
  uma seção de correções no topo: o review foi **validado achado por achado contra o código** e
  sete itens dele estavam imprecisos. Ler as correções antes de citar qualquer seção.
- **`docs/HARDENING-EM-ANDAMENTO.md`** — o que já foi corrigido a partir desse review, o que
  falta, e o que **só um operador com acesso a console pode fechar** (migrations do Prisma,
  secrets do Vault, rotações). Começa pela regra de verificação: *checar por código de saída,
  nunca por grep na saída* — um `grep -ci '\berror\b'` reportou "0 erros" enquanto o eslint
  estava **crashando** com um `TypeError`.
- **`.github/workflows/ci.yml`** — lint/typecheck/build/test por app + **gitleaks** (secret
  scanning), **CodeQL** (SAST js/ts), `pnpm audit` e geração de **SBOM** em push/PR.
- **`.github/dependabot.yml`** — atualização semanal de deps (pnpm + github-actions).
- Os planos foram validados contra o estado real (queries ao banco de produção, `pnpm audit`,
  GitHub API), não só releitura de documento — histórico completo das correções em `HANDOFF.md`.

## Documentação por app

- `locavia-dashboard/README.md` · `CLAUDE.md` · `DESIGN.md`
- `maturitymodel/ARCHITECTURE.md` · `STATUS.md` · `docs/` (ambos citam onde estão defasados e
  apontam para a fonte de verdade atual)
- `neo-hub/` — landing (identidade no próprio `index.html`)
- `HANDOFF.md` — estado operacional corrente (ler antes de trabalhar)
