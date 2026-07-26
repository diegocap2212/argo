# HANDOFF — NEO (Núcleo de Evolução e Operação)

> **Novo no projeto?** Comece por [`ARCHITECTURE.md`](ARCHITECTURE.md) (o mapa e o que é
> load-bearing) e [`ONBOARDING.md`](ONBOARDING.md) (do zero ao deploy). Este arquivo é o
> **estado operacional corrente** — histórico e pendências.

## Rodada 2026-07-26 — Nero vira a porta 03 + costuras unificadas

Estado: **tudo em `feat/nero-porta-03` (11 commits), NADA promovido para produção.** O
`neo-lm.vercel.app` segue servindo o código anterior.

### O que mudou

| Frente | Resultado |
|---|---|
| **pnpm workspaces** | 5 lockfiles/installs → 1. Resolve a *causa* do npm#4828 (o `node_modules` isolado não faz o hoisting que derrubava o binário do rollup) em vez de contorná-la. Validado no builder Linux |
| **`@neo/auth`** | Contrato de sessão canônico (Web Crypto: roda em Edge, Node e Next) + **arnês de contrato** com 77 asserções |
| **Nero no monorepo** | `git subtree` (história preservada) + rewrite `/nero/**` + `basePath` |
| **Gate** | `api/tower.ts` → `api/gate.ts` com escopo (`tower`\|`nero`). Nero exige `neo_session` **E** `neo_nero` |
| **Porta 03** | Layout 2+1 no hub, selo "Acesso restrito", zero JS novo |
| **`@neo/design`** | Tokens compartilhados (só tokens, sem componentes) |
| **Review do Nero** | Primeiro da história dele: `docs/QA-REVIEW.md`, 5 corrigidos / 6 pendentes |
| **E2E do portal** | 20 casos de matriz de gate; gate pós-deploy, não por commit |
| **Migrations** | `db push` fora do build; baseline aplicado em produção com backup |
| **Docs** | `ARCHITECTURE.md`, `ONBOARDING.md`, `SECRETS.md` novos |

### O que morreu

- **Login próprio do Nero** (`APP_PASSWORD`): senha única compartilhada, cookie de 30 dias, e
  o token era HMAC de uma **constante** — sem `exp`, logo **não expirava de fato**. Sem
  rate-limit. Substituído por identidade do NEO + senha com TTL 12h, rate-limit e auditoria.
- **`api/tower.ts`**, absorvido pelo `api/gate.ts`.
- **`prisma db push` no deploy** — ver incidente evitado abaixo.
- **Gatilho de deploy no repo arquivado**: o projeto `nero-portal` ainda deployava de
  `diegocap2212/nero-portal`. Um push lá subiria o código antigo, que lê a `APP_PASSWORD`
  removida — Nero quebrado disparado por push num repo que todos consideram morto. Git
  desconectado.
- **`.gitignore` furado**: listava só `.env`, `.env.local` e `.env.private` nominalmente, então
  `.env.test.local` **não era ignorado**. Trocado por `.env*` + `!.env.example`.

### Incidente evitado: preview escrevendo em produção

Um deploy de **preview** do `nero-portal` rodou `prisma db push` **contra o banco de
produção**. Sem dano (schema idêntico → no-op), mas o mecanismo está provado: se a branch
tivesse mudança de schema, o preview a aplicaria em produção em silêncio, sem backup e sem
trilha. Duas causas somadas: `vercel-build` fazia `db push`, e as envs `POSTGRES_*` estão em
`Production, Preview` (mesmo banco nos dois ambientes).

Corrigido na raiz: `vercel-build` é `prisma generate && next build`, e schema muda por
`db:migrate`. Baseline `0_init` (17 tabelas, 0 DROP) aplicado em produção com backup
(`backup-pre-migrate-baseline`) e dados conferidos antes e depois (198/10/212 idênticos).

### Restrições de plataforma medidas (não folclore)

- **Funções da Vercel não resolvem código compartilhado.** Edge Middleware falha no deploy
  ("unsupported modules") tanto com bare specifier quanto com caminho relativo; function Node
  **passa no build e quebra em runtime** com `ERR_MODULE_NOT_FOUND`. Por isso `middleware.ts`,
  `api/session.ts` e `api/gate.ts` são autocontidos — e o arnês de contrato é o que impede as
  cópias de divergirem.
- **Streaming atravessa rewrite externa** sem buffering (medido: chunks incrementais,
  `chunked` e `no-store` preservados, ~150ms no primeiro byte). Era o risco que poderia ter
  invalidado a arquitetura toda.
- **`vercel env add ... preview` é impossível não-interativamente** na CLI 54: sem branch dá
  `git_branch_required`; com branch dá `branch_not_found`; com o Git desconectado, de novo
  `git_branch_required`. A CLI sugere um comando que ela própria rejeita.
- **`vercel env rm NOME preview` apaga a variável inteira**, produção incluída. Produção é
  write-only. Quase virou incidente — só não virou porque as URLs eram reconstituíveis pelo
  `neonctl`.
- **Deploy do Nero exige `--local-config nero-portal/vercel.json`**, senão a CLI usa o
  `vercel.json` da raiz e roda o build do portal dentro do projeto do Nero.

### Custo real do Nero (primeira medição)

**US$ 6,91 no mês corrente, 80 turnos → ~US$ 0,086/turno**, 34,5% do teto de US$ 20. Base de
198 registros em `UsageLog`. É o número que ancora o modelo de custo do blueprint enterprise.

### Antes de promover

1. Deployar o `nero-portal` com o código novo (`--local-config`), depois o portal.
2. Rodar o e2e com `NEO_FULL_STACK=1` (3 casos hoje pulados dependem disso).
3. Fluxos logados manuais: OTP → 3 portas → Nero pede senha → chat/estado/catálogo/report →
   logout.
4. Regressão da Torre (mudou de `api/tower` para `api/gate`).
5. **A rotação do `SESSION_SECRET` faz todos refazerem login no primeiro deploy do `neo-lm`.**

### Pendências desta rodada

- Envs de **Preview** do `nero-portal` apontando para a branch `preview` do Neon — exige
  dashboard (catch-22 da CLI). Deixou de ser urgente com o `db push` fora do build; hoje é
  defesa em profundidade.
- Arquivar `diegocap2212/nero-portal` no GitHub (o Vercel já não deploya de lá).
- Remover o projeto Vercel descartável `neo-lm-verify` (harness de validação desta rodada).
- Os 6 itens abertos em `nero-portal/docs/QA-REVIEW.md`.

---


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

## Roles do MMA — IMPLEMENTADO E NO AR (2026-07-15)

Migration `20260715120000_portal_admins_scoped_roles.sql` aplicada em produção (Management API) e
front promovido (dpl `neo-m03zmhx8t`). Admins globais por e-mail de login: `ext.diego.caporusso@`
e `ext.tiago.massaro@lmmobilidade.com.br` (backup) — tabela `portal_admins`/`is_portal_admin()`.
SM/AM só veem/gerenciam os próprios squads; restart/exclusão/conteúdo/criação = só admin;
diretório de profiles fechado (RPC `find_profile_by_email`); views `v_*` com `security_invoker`
(bypass de RLS corrigido). Front: `RequireManager`, AdminMMA em 2 modos. Junto foi o hardening
da sessão apartada de QA (headers globais, rate-limit Torre via KV, no-store, remoção do cookie
legado das functions, cache em memória no /api/data) + fix do 302 imutável do middleware.
Detalhes: `maturitymodel/docs/ROLES-REDESIGN.md`.

## QA profundo — correções aplicadas (2026-07-15)

Rodada de fixes a partir do relatório do QA externo (`docs/QA-PLAN.md`). **Código no repo; falta
aplicar a migration no banco, deployar e validar os fluxos logados (ver "Pendências").**

- **Escalada SM→AM (CRÍTICO):** migration `20260715150000_fix_sm_am_privilege_escalation.sql` —
  `sqm_write` passa a exigir admin global OU AM existente do squad para gravar `role='am'`; SM
  não se auto-promove. UI (`AdminMMA`) esconde o papel `am` de quem não é admin global.
- **Fail-open → fail-closed em produção:** middleware, `api/data`, `api/comments` e `api/tower`
  agora NEGAM quando a env some (`VERCEL_ENV==='production'`); dev/preview seguem abertos (paridade).
- **/api/comments:** validação de tipo/tamanho (ids ≤200, gap/action ≤4000). Autz segue por sessão
  NEO (qualquer @lmmobilidade escreve — ferramenta interna; sem membership por squad no Dash).
- **Cookie malformado:** `decodeURIComponent` com try/catch no middleware e no tower (fim do 500).
- **Rate-limit da Torre:** `EXPIRE` em toda tentativa (elimina lockout permanente se o INCR criasse
  a chave e o EXPIRE falhasse). Ainda é por-IP (NAT corporativo pode agrupar tentativas — aceito).
- **trigger-sync:** valida método antes da auth (PUT→405, não 401).
- **CSP completa** no `vercel.json` (`default-src 'self'`, `connect-src` só self+supabase, `object-src none`,
  `frame-ancestors 'self'` já cobria todas as rotas). `script/style-src` mantêm `'unsafe-inline'` (SPA Vite
  tem script inline de tema + Google Fonts) — endurecer via hash/externalização é hardening futuro.
- **OpenAPI** (`locavia-dashboard/src/api-docs/openapi.ts`): reflete Bearer (JWT Supabase) + `neo_session`;
  removidos `/api/login`/`dash_session`/senha-HMAC.
- **E2E do Dash:** 5/5 verdes de novo (headings/labels desatualizados corrigidos; `ContextJourney` era
  componente morto). `browserslist`/caniuse-lite atualizado nos 4 apps. ApiDocs (1.39MB) e recharts já
  eram chunks lazy — só carregam sob demanda.
- **CI:** `.github/workflows/ci.yml` — typecheck/lint/build/test por app em push/PR.
- **Matriz de RLS:** `maturitymodel/tests/rls/rls-matrix.ts` (4 identidades; regressão da escalada).
  Precisa de branch Supabase + service_role para rodar (`npx tsx tests/rls/rls-matrix.ts`).
- **Monorepo sem backup:** o remoto `diegocap2212/argo` existe mas está VAZIO (nunca recebeu push) —
  por isso `origin/main [gone]`. Push do main resolve o backup.

Achados avaliados como NÃO-vulnerabilidade (design): senha da Torre protege a VISUALIZAÇÃO, não o
`/api/data` (mesmo dataset que qualquer usuário NEO já acessa — Torre é reorganização, não segredo novo).
Se o comparativo SM×SM virar sensível, mover o cálculo server-side atrás do cookie `neo_tower`.

## Saúde dos times recalibrada (2026-07-15) — NO AR

Critério de saúde (`locavia-dashboard/src/performance/health.ts`) estava marcando quase todo time
como Crítico (contagem plana de 5 riscos com gatilhos quase sempre ligados). **Afrouxado
temporariamente** para a janela de release (dpl `neo-p6w8r0qwf`): aging por proporção (>40% do WIP
e ≥5 itens), leadTime P85 >45d, flowBalance >max(5, saída×0,5), previsib. <60%; `dataQuality`
removido (flag morto); novo status **"Sem dados"** para times sem entregas/WIP (não são mais
"Saudável"). Efeito: Crítico 5→0, Nivus→Atenção. UI ganhou motivos no hover + legenda do critério.
Limites/labels centralizados em `health.ts` (eram duplicados em 3 telas). **REAPERTAR quando a
operação normalizar** (voltar `HEALTH_THRESHOLDS`). Smoke test logado do board ficou pendente
(sessão expirou; validado localmente por auditoria no dataset real + E2E).

## Validação do SECURITY-PLAN.md (2026-07-15) — NO AR

Checklist validado item a item contra o estado real (não só leitura de doc). Vários já
estavam corrigidos (confirmado por query direta ao banco): `is_any_am()` morto em produção,
views com `security_invoker`, clickjacking global, CSP, rate-limit da Torre. Achado novo e
grave fora do radar do plano original: **`diegocap2212/locavia-dashboard` estava PÚBLICO**
e continha `sfmkt_data.json` com dados reais do Jira (nomes de assignee, sumários de card) —
vazamento de dado, não só de código. Ações aplicadas (dpl `neo-qmsixjhdd` + `neo-5wv4d7tpt`):

- Repo tornado **privado**.
- `xlsx` removido (Dash + MMA) — vuln alta sem fix no npm, nunca importada em código.
- `npm audit fix` (sem `--force`) → **0 vulnerabilidades em deps de produção** nos 2 apps.
- GitHub Actions pinadas por SHA (`actions/checkout`, `actions/setup-node`) no monorepo
  **e** no repo externo que roda o cron de verdade.
- Dependabot (npm + github-actions) nos 2 repos.
- Torre loga e-mail de quem acessa (logs da Vercel, nunca em resposta HTTP).
- **`TOWER_PASSWORD` rotacionada** (a antiga havia passado pelo chat) — valor novo gerado e
  injetado direto na Vercel, nunca impresso; envs de Production já vêm *Sensitive* por
  padrão neste CLI. **Pegar o valor novo em**: dashboard Vercel (neo-lm → Settings →
  Environment Variables → Production) ou `vercel env pull` local.

Pendente (só você pode fazer): revogar os tokens Supabase `sbp_a5f2...` (2026-07-14) e
`sbp_6ac9...` (2026-07-15, usado nesta sessão) em supabase.com/dashboard/account/tokens;
rotacionar senha de app do Gmail e API key do Resend. 2FA nas contas (Vercel/GitHub/
Supabase/cron-job.org) e escopo do `GITHUB_DISPATCH_TOKEN` seguem só verificáveis manualmente.

## Pendências pós-cutover
2. **E-mail OTP:** mitigado (código no assunto, remetente "NEO — LM Mobilidade", OTP 1h, reenvio com cooldown no hub). Definitivo = Resend: 3 registros DNS em lmmobilidade.com.br pendentes + trocar SMTP (hoje Gmail pessoal).
3. **Rotacionar segredos que passaram pelo chat:** token Supabase `sbp_a5f2...` (2026-07-14), senha de app do Gmail, API key antiga do Resend.
4. Fase 3c: remover ramo cookie legado (`dash_session`/`DASHBOARD_PASSWORD`) das functions + `openapi.ts`.
5. ~~`.env.example` dos apps citam `VITE_HUB_URL`/`VITE_MMA_ORIGIN`~~ — limpo em 2026-07-15.
6. ~~Aplicar `20260715150000` no banco~~ — **aplicado em produção 2026-07-15** (Management API, 201); policy `sqm_write` verificada com `role<>'am'`.
7. ~~Deployar as mudanças~~ — **deployado 2026-07-15** (dpl `neo-kfnpuc6h4`, aliased `neo-lm.vercel.app`). Fluxos logados validados: Dash+dados (`/api/data` 200, ~5,77 MB / ~579 KB gzip), detalhe do time (5 abas/16 gráficos), MMA+iframe same-origin (`/dash/time/GOL?embed=1`, 0 erros CSP), Torre (senha OK → comparativo), logout → `/dash/` re-bloqueado (302). Smoke não-auth: `/` 200, `/dash/` 302, `/api/data|tower` 401, `PUT /api/trigger-sync` 405, cookie malformado sem 500, CSP completa presente. **Falta só a matriz RLS automatizada** (`rls-matrix.ts`) — destrutiva, rodar em branch Supabase.
8. ~~Push do monorepo para `origin`~~ — **feito 2026-07-15** (`origin/main` restabelecido).

## Pegadinhas

- `supabase config push` reseta `[auth]` — config SMTP/allowlist foi via Management API.
- Deploy do portal: NUNCA `npm run build` do dash no build composto (roda sync:sfmkt e exige credenciais) — o script usa `tsc -b && vite build`.
- `vercel env add NAME preview --value X --yes` está quebrado no CLI 54 (catch-22 `git_branch_required`); usar o dashboard ou API com PAT.
- Redis (Upstash) usado por `api/comments.ts`. `verifyBearer` duplicado inline nas functions de propósito (Vercel não bundleia imports entre functions).
- Sem `SESSION_SECRET` o middleware é fail-open (paridade com dev) — obrigatória em produção.
