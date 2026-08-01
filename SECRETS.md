# Segredos e variáveis — inventário

**Este arquivo nunca contém valores.** Ele diz o que existe, para que serve, onde buscar e
quem rotaciona. Valores vivem só nos projetos Vercel e nos consoles dos provedores.

> Envs de Production na Vercel são **Sensitive**: write-only. `vercel env pull` as devolve
> **vazias**. Isso não é bug — é o motivo de este inventário existir em vez de um `.env` de
> referência.

## Projeto Vercel `neo-lm` (portal: hub, Dash, Maturity, functions, middleware)

| Variável | Para quê | Onde obter | Se faltar em produção |
|---|---|---|---|
| `SESSION_SECRET` | Raiz das SUBCHAVES de `neo_session`, `neo_tower`, `neo_nero` (HKDF por propósito) | gerar 32B; **tem de ser idêntico no `nero-portal`** | middleware 503 (fail-closed) |
| `NEO_AUTHZ_SECRET` | `/api/authz` pergunta ao Postgres quem pode entrar no Nero. **Mesmo valor do segredo `neo_authz_secret` no Vault** | gerar 32B+ | `/api/authz` 503 → **Nero fecha** |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Functions validam Bearer via RPC `is_neo_allowed` | console Supabase | `/api/data` 401 (fail-closed) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Build dos apps (chave pública; a segurança real é RLS/JWT) | idem | hub não faz login |
| `BLOB_READ_WRITE_TOKEN` | Dataset do Jira no Vercel Blob | Vercel → Storage | `/api/data` cai no fallback versionado |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis: comentários + rate-limit do gate | Vercel → Storage | gate 503; comentários falham |
| `ALLOWED_ORIGIN` | CORS de `/api/comments` | `https://neo-lm.vercel.app` | CORS bloqueia |

### `TOWER_PASSWORD` e `NERO_PASSWORD` — a remover DEPOIS da janela do RBAC

As duas saíram de uso em 2026-07-31: a Torre passou a depender de `dash.tower.view` e o Nero de
`neo.nero.access`. **Nenhum código lê os cookies `neo_tower`/`neo_nero`** — `api/gate.ts` ainda
os EMITE, mas não há mais quem os confira, então o endpoint está inerte.

Elas continuam na tabela do projeto Vercel de propósito, e só até a janela fechar: apagá-las
antes do promote quebraria o `/api/gate` do código ANTIGO, que é o que roda em produção até lá.
Depois de promover as duas metades e confirmar que o Nero e a Torre abrem por permissão:

```bash
vercel env rm TOWER_PASSWORD production
vercel env rm NERO_PASSWORD production
# e então remover api/gate.ts, que passa a não ter chamador nenhum
```

`CRON_SECRET` e `GITHUB_DISPATCH_TOKEN`/`GITHUB_*` **não são mais usadas por nada.** Os
endpoints que as consumiam (`/api/trigger-sync` e `/api/refresh`) foram removidos em
2026-07-27: nunca estiveram ativos (as envs estavam vazias desde o cutover — ver `HANDOFF.md`)
e o sync roda por cron nativo do GitHub Actions. Se ainda existirem no projeto Vercel, podem
ser apagadas.

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

## Supabase — secrets das Edge Functions (projeto `cvkcngrmnfwupstyrpsd`)

`supabase secrets set NOME=valor`. Não aparecem em `vercel env`.

| Secret | Para quê | Se faltar |
|---|---|---|
| `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN` | Único ponto de contato com o Jira (âncoras) | sync de âncoras falha |
| `SB_URL`, `SB_SERVICE_ROLE` | Gravar `anchor_readings` contornando RLS | idem |
| `SB_ANON_KEY` | Chamar o RPC `can_sync_anchors` com o JWT do usuário | `sync-anchors-user` responde 403 (**fail-closed**) |
| `ANCHOR_SYNC_CRON_SECRET` | Autentica o cron em `sync-anchors-cron` | cron responde 401 (**fail-closed**) |

### Vault do Postgres (lido pelo job de pg_cron)

O job de cron não pode ter segredo hardcoded no SQL versionado — era exatamente o problema
corrigido em 2026-07-27. Ele lê do Vault:

```sql
select vault.create_secret('https://cvkcngrmnfwupstyrpsd.supabase.co/functions/v1/sync-anchors-cron',
                           'anchor_sync_url');
select vault.create_secret('<secret longa e aleatória>', 'anchor_sync_secret');
```

`anchor_sync_secret` e `ANCHOR_SYNC_CRON_SECRET` têm de ter **o mesmo valor**. Se qualquer um
dos dois segredos do Vault faltar, `net.http_post` recebe NULL e o cron não roda — fail-closed
de propósito, em vez de cair para um default que funcione.

### Vault: `neo_authz_secret` (lido por `neo_perms_for_email`)

Mesma técnica, agora para o `/api/authz`. O Nero só tem o cookie do portal, não o JWT do
Supabase, então quem pergunta "esta pessoa pode entrar?" é uma function sem usuário. Consultar
com `service_role` seria repetir o P0 do `sync-anchors`; o que autoriza é este segredo.

```sql
select vault.create_secret('<segredo longo e aleatório, 32+ caracteres>', 'neo_authz_secret');
```

⚠️ **`neo_authz_secret` (Vault) e `NEO_AUTHZ_SECRET` (env do `neo-lm`) têm de ter o mesmo
valor** — é a mesma pegadinha do par acima, e o modo de falha é o pior possível: a função
devolve `{}` para todo mundo, `/api/authz` responde 403, e o **Nero fecha para a empresa
inteira em silêncio**. Segredo com menos de 32 caracteres também é recusado pela função.

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

## Tokens de sessão: uma subchave por propósito

`SESSION_SECRET` **não assina os cookies diretamente.** Cada cookie usa uma subchave derivada
por HKDF-SHA256, com o propósito como `info`:

| Cookie | Propósito (`info` do HKDF) | Emitido por | Lido por |
|---|---|---|---|
| `neo_session` | `neo_session` | `api/session.ts` | `middleware.ts`, `api/gate.ts`, proxy do Nero |
| `neo_tower` | `tower` | `api/gate.ts?scope=tower` | `api/gate.ts` |
| `neo_nero` | `nero` | `api/gate.ts?scope=nero` | `api/gate.ts`, proxy do Nero |

**Por quê.** Antes os três eram assinados com o mesmo segredo e os verificadores checavam só
assinatura + `exp`: qualquer token válido servia em qualquer trava, então copiar o valor de um
cookie para outro era escalada de privilégio. Um campo `purpose` no payload não resolveria
sozinho — dependeria de os QUATRO verificadores lembrarem de conferi-lo, e três deles são
cópias autocontidas (imposição do Edge Middleware da Vercel). Com subchave, a assinatura de
outro propósito simplesmente não confere.

O salt (`neo-portal/token-subkey/v1`) é público e vive em **cinco** arquivos que têm de
concordar: `packages/neo-auth/src/index.ts`, `middleware.ts`, `api/session.ts`, `api/gate.ts` e
`api/authz.ts` (a quarta cópia autocontida, de 31/07). `pnpm --filter @neo/auth test` falha se
divergirem.

Desde 31/07 o payload do `neo_session` carrega também `roles` e `perms` — as claims de
navegação. **Ausente não é o mesmo que vazio**: cookie sem `perms` é anterior ao RBAC e a borda
o manda ao hub para re-emissão (autocura); cookie com `perms: []` é de quem realmente não tem
permissão. O `api/session.ts` tem um teto de tamanho (3.800 bytes): se o catálogo crescer a
ponto de o cookie ser descartado pelo browser, ele emite a sessão SEM claims e grita no log —
sessão sem claim ainda entra pelo hub, cookie descartado não entra em lugar nenhum.

> ⚠️ **O deploy desta mudança derruba TODA sessão viva.** O formato do token mudou, então os
> cookies existentes deixam de verificar: todos refazem login (OTP) e redigitam a senha da
> Torre/do Nero. É o mesmo efeito de rotacionar `SESSION_SECRET`. Avise antes; não é incidente.

## Rotação

**Rotina anual, ou imediata em suspeita de exposição.**

| Segredo | Efeito da rotação |
|---|---|
| `SESSION_SECRET` | Atualizar nos **dois** projetos e redeployar ambos. Todos refazem login (OTP) |
| `NEO_AUTHZ_SECRET` | Trocar no Vault (`neo_authz_secret`) **e** na env, na mesma janela. Enquanto divergirem, o Nero fecha para todos |
| ~~`TOWER_PASSWORD` / `NERO_PASSWORD`~~ | Sem uso desde 31/07 — a remover depois da janela do RBAC (ver acima) |
| `ANTHROPIC_API_KEY` | Chat e report param até atualizar |
| Chaves Supabase / Blob / Upstash | Rotacionar no provedor e refletir na Vercel |

Rotina: gerar → `vercel env rm` → `vercel env add` → **redeployar** (env só vale no próximo
deploy) → verificar.

> ⚠️ **`vercel env rm NOME preview` apaga a variável INTEIRA**, produção incluída — não só o
> target preview. Como produção é write-only, você não recupera o valor. Antes de qualquer
> `env rm` em variável multi-target, garanta que o valor é reconstituível (para URLs de banco,
> por exemplo, `neonctl connection-string <branch>`).

## Pendências de rotação

**Uma pendência só fecha com evidência.** Cada linha precisa de `revogado_em`, responsável,
substituto e como se comprovou que a credencial antiga morreu. "Acho que revoguei" mantém o
incidente aberto: o code review de 2026-07-27 classificou estas linhas como *risco
operacional*, não documentação, justamente porque nenhuma tem prova de revogação.

Enquanto a coluna **Revogado em** estiver vazia, considere a credencial VIVA.

| # | Credencial | Exposta em | Responsável | Substituto | Revogado em | Evidência da revogação |
|---|---|---|---|---|---|---|
| 1 | Token pessoal Supabase `sbp_a5f2…` | 2026-07-14 | Diego | conta de serviço, não token pessoal | — | — |
| 2 | Token pessoal Supabase `sbp_6ac9…` | 2026-07-15 | Diego | idem | — | — |
| 3 | Senha de app do Gmail | — | Diego | — | — | — |
| 4 | API key antiga do Resend | — | Diego | key nova já em uso | — | — |
| 5 | Escopo do `GITHUB_DISPATCH_TOKEN` | — | Diego | token de escopo mínimo | — | — |
| 6 | 2FA em Vercel / GitHub / Supabase / cron-job.org | — | Diego | — | — | — |
| 7 | **Anon key do projeto Supabase** | migration `20260712190000_anchor_sync_cron.sql`, no **histórico do git** | Diego | cron passou a usar `ANCHOR_SYNC_CRON_SECRET` (Vault) | — | — |

Como preencher (exemplo do que conta como evidência):

- **Tokens Supabase:** `supabase.com/dashboard/account/tokens` não lista mais o token, **e** uma
  chamada autenticada com ele responde 401. Anexar data/hora.
- **Anon key (linha 7):** rotacionar em `Project Settings → API → JWT keys`, redeployar os apps
  que a usam no build (`VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SB_ANON_KEY`), e
  confirmar que a chave antiga recebe 401 no PostgREST. Reescrever histórico do git **não** é
  requisito: a chave é pública por design; o que era grave é ela ser GATILHO de escrita
  privilegiada, e isso a divisão `sync-anchors-user`/`sync-anchors-cron` já fechou.

> Sobre a linha 7: a anon key não é um segredo (vai no bundle do browser). Ela está aqui porque
> o cron a usava como credencial de acionamento de uma função que gravava com `service_role` —
> transformando uma chave pública em gatilho privilegiado. O código já não faz isso; a rotação
> restante é higiene, não contenção.

## Regras

1. Segredo **nunca** em código, commit, chat, issue ou log.
2. `.gitignore` cobre `.env*` com exceção do `.env.example` — mas confira antes de criar
   arquivo novo de credencial.
3. Logs registram **quem** acessou (e-mail), nunca o segredo. `api/gate.ts` loga o e-mail de
   quem abriu a Torre/o Nero via `console.log` — visível em `vercel logs`, nunca em resposta
   HTTP.
4. Repositório **privado**. O `SECURITY-PLAN.md` registra um caso de repo que virou público com
   dado real do Jira dentro.
