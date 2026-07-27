# Operação — Portal NEO

**Owner:** Diego Caporusso · **last_verified_at:** 2026-07-27

Runbooks para rodar, verificar e consertar. Arquitetura em [`ARCHITECTURE.md`](ARCHITECTURE.md),
estado corrente em [`HANDOFF.md`](HANDOFF.md), garantias e testes em [`SECURITY.md`](SECURITY.md).

---

## 0. A regra de verificação

**Cheque por código de saída, nunca por grep na saída.**

Um `grep -ci '\berror\b'` na saída do lint reportou **"0 erros"** enquanto o eslint estava
**crashando** — `\berror\b` não casa dentro de `TypeError`. O comando falhou, o grep não viu, e o
resultado foi um relatório de "verde" falso. Use `if cmd; then ...` ou `$?`.

```bash
# Errado: conta palavras na saída de um comando que pode nem ter rodado
corepack pnpm lint | grep -ci error

# Certo: o shell decide pelo código de saída
if corepack pnpm lint; then echo OK; else echo FALHOU; fi
```

## 1. Setup

`pnpm` **não está no PATH** desta máquina — use `corepack pnpm`. Um install, na raiz, cobre tudo:

```bash
corepack pnpm install --frozen-lockfile
```

Não rode `npm install` dentro de uma pasta de app: não existe `package-lock.json` e você monta um
`node_modules` divergente do lockfile do workspace.

## 2. Suíte de verificação completa

Um comando, ~15 min, encadeado por `&&` — **basta olhar o código de saída**:

```bash
corepack pnpm verify
```

Equivale a:

```bash
corepack pnpm typecheck                                       # borda (api/ + middleware.ts) E os workspaces
corepack pnpm lint
corepack pnpm --filter @neo/auth test                         # 96
corepack pnpm --filter locavia-dashboard test:performance
corepack pnpm --filter locavia-dashboard test:sync            # 32
corepack pnpm --filter maturitymodel test:journey             # 21
corepack pnpm --filter maturitymodel test:anchors             # 17
corepack pnpm --filter maturitymodel test:migrations          # 55 aplicadas, 2 puladas
corepack pnpm --filter maturitymodel test:rls-local           # 88
corepack pnpm --filter nero-portal test:core                  # 88
```

Tudo isso passa hoje (exit 0, verificado em 2026-07-27); se algo falhar, é regressão.

**Fora da suíte, de propósito** — cada um exige recurso que a máquina de quem lê pode não ter:

- `pnpm --filter nero-portal test:state` — **escreve no banco** apontado pelas envs. Só contra
  branch descartável do Neon. Nunca produção.
- `pnpm --filter maturitymodel test:rls` — exige um Supabase real. A versão `test:rls-local` cobre
  a mesma matriz em Postgres efêmero (PGlite) e roda em qualquer lugar.
- `pnpm test:portal` — Playwright, exige deployment.

> **Por que os scripts da raiz chamam `corepack pnpm` em vez de `pnpm`:** um script que invoca
> `pnpm -r` recursivamente falha nesta máquina, porque o `pnpm` do PATH do processo filho não existe
> (o pnpm aqui vem por shim do Corepack). `corepack` **está** no PATH — ele vem com o Node. Os
> scripts `lint`, `typecheck` e `verify` estavam quebrados local por isso e foram corrigidos.

## 3. Runbooks

### 3.1 O dashboard mostra número diferente do esperado

Antes de investigar código, elimine a **janela deslizante**: `audit:performance` mede os últimos 56
dias a partir de `new Date()`, então a vazão muda entre execuções do **mesmo código** ao longo do
dia (medido: 1198 às 06:00 UTC, 1187 às 18:00 do mesmo dia).

```bash
AUDIT_NOW=2026-07-27T06:00:00Z corepack pnpm --filter locavia-dashboard audit:performance
```

Se com `AUDIT_NOW` fixo o número bate, não houve regressão.

Depois disso, na ordem: `source` da resposta de `/api/data` (é `fallback`?), `syncedAt` (é `null`?),
`DataQuality.historyComplete` (métrica de etapa é confiável?), e o log do último `hourly-sync`.

### 3.2 O sync falhou ou o dataset foi bloqueado

O contrato do dataset (`sync/dataset-contract.ts`) tem duas severidades:

- **`bloqueia`** — a publicação no Blob é abortada. O dado no ar continua o anterior, que é o
  comportamento correto: publicar um dataset que descreve realidade falsa é pior que ficar velho.
  Regras: volume fora de `[500, 100.000]`, queda >30% vs. o último sync, time que existia e não
  veio, `Key` duplicada, data não parseável, >95% sem Release, >90% sem Time, >50% dos DONE sem
  `resolutiondate`.
- **`alerta`** — publica e avisa. Time novo, item criado no futuro, `Resolved < Created`, e
  **`historico-parcial`** (>50% dos itens sem changelog completo: entrega e lead time seguem
  válidos porque vêm de `resolutiondate`; cycle time por etapa e `TimeInTodo` ficam não confiáveis).

**`time-desaparecido` ou `drift-release`/`drift-time`** quase sempre significam **custom field
renomeado no Jira** — não bug no sync. Um campo renomeado não dá erro: o mapper lê `undefined` e
cai no default. Confira `TIME_FIELD_TO_TEAM` em `sync/field-mapper.ts` e os IDs
(`customfield_11795` = Time, `customfield_11330` = Release).

Baseline em `src/data-baseline.json`. Se a mudança de volume for **legítima** (squad realmente
encerrado), atualize o baseline no mesmo commit em que se aceita a mudança — não afrouxe a regra.

### 3.3 `/dash` ou `/maturity` responde 503

Falta `SESSION_SECRET` em produção. É **fail-closed de propósito** — env sumida não libera as apps.
Repor a env no projeto `neo-lm` (Production) e redeployar. Não "resolva" removendo o fail-closed.

### 3.4 O Nero recusa turnos por orçamento

Dois tetos, ambos por reserva atômica antes do turno:

- `NERO_MONTHLY_BUDGET_USD` — global. Estourou: o mês inteiro para.
- `NERO_USER_MONTHLY_BUDGET_USD` — por identidade. Estourou: só aquela pessoa para.

A *leitura* do gasto é fail-open (Postgres indisponível não derruba o Nero); a *reserva* é
fail-closed. Se o gasto parecer alto sem uso proporcional, confira `pricing.ts`: o Sonnet 5 está em
preço promocional ($2/$10) **até 2026-08-31**, e há teste que falha quando o prazo vence — é
proposital, é o lembrete de voltar para $3/$15.

Lembre que o Sonnet 5 usa tokenizer novo (~30% mais tokens para o mesmo texto), então o custo por
turno sobe mesmo com preço por token igual.

### 3.5 O cron das âncoras do Maturity toma 401

Esperado até um operador criar os segredos — a função nova não aceita mais a anon key:

```bash
# Vault (via SQL no Supabase): anchor_sync_url, anchor_sync_secret
supabase secrets set ANCHOR_SYNC_CRON_SECRET=<mesmo valor de anchor_sync_secret> SB_ANON_KEY=<anon>
supabase functions deploy sync-anchors-user
supabase functions deploy sync-anchors-cron
```

`anchor_sync_secret` (Vault) e `ANCHOR_SYNC_CRON_SECRET` (secret da função) **têm de ter o mesmo
valor**, senão o cron chama e toma 401 silenciosamente.

### 3.6 Aplicar mudança de schema

**Maturity (Supabase):** `supabase db push` com a CLI linkada. Migrations em
`maturitymodel/supabase/migrations/`. Cuidado com `supabase config push`: reescreve a seção
`[auth]` **inteira**, não é patch — revise o diff. Já causou incidente.

**Nero (Neon/Prisma):** migration versionada, **nunca** `db push`, **nunca** no build.

```bash
corepack pnpm --filter nero-portal db:migrate:new     # gera
# revisar o SQL — se aparecer DROP ou ALTER ... NOT NULL, PARAR
corepack pnpm --filter nero-portal db:migrate         # aplica
```

Backup antes, sempre:

```bash
neonctl branches create --name backup-pre-<mudança>
pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f backup-pre-<mudança>.dump
```

O `vercel-build` do Nero é `prisma generate && next build` — **não** aplica schema. Quando aplicava
(`prisma db push` no build), foi a causa do incidente de preview tocando produção. O `Dockerfile`
ainda carrega esse `db push` no `CMD` e por isso está marcado **NÃO OPERACIONAL** — nada o invoca.

### 3.7 Deploy

Um único projeto Vercel (`neo-lm`), da **raiz** do monorepo, via CLI (Git desconectado):

```bash
corepack pnpm build:portal                                  # valida o build composto local
vercel deploy --target=production --skip-domain             # staging com URL própria
# smoke: login OTP → /dash → /maturity → /nero → Torre
vercel promote <deployment>
```

Teste funcional de middleware+functions **só em deployment** — nunca com `vercel dev`.

### 3.8 Trocar `SESSION_SECRET` ou a derivação de token

**Isto desconecta todo mundo.** Os tokens são assinados com subchaves HKDF derivadas de
`SESSION_SECRET`; mudar o segredo ou o esquema de derivação invalida toda sessão viva, e as pessoas
caem no login. Avise o time antes. Não é bug: é o custo de a chave ser a fronteira.

## 4. Pendências que só um operador fecha

| # | O quê | Por quê está aberto |
|---|---|---|
| 1 | Aplicar as duas migrations do Prisma (`20260727160000_audit_actor_and_budget_reservation`, `20260727170000_domain_constraints`) | exige acesso ao Neon |
| 2 | Vault + secrets do cron de âncoras (§3.5) | exige acesso ao Supabase |
| 3 | Rodar `nero-portal test:state` contra base descartável | exige um Postgres descartável |
| 4 | Avisar o time da queda de sessões (§3.8) | decisão de comunicação |
| 5 | Rotações de segredo pendentes | ver [`SECRETS.md`](SECRETS.md) |
| 6 | Backup/restore testado, RPO/RTO, retenção; preview isolado do Nero | exige console Neon/Vercel |
| 7 | Definir `NERO_USER_MONTHLY_BUDGET_USD` | decisão de negócio |

Detalhe de cada item em [`docs/HARDENING-EM-ANDAMENTO.md`](docs/HARDENING-EM-ANDAMENTO.md).
