# Portal Nero — Advisor de Dados (DAMA-DMBOK2)

Portal web que transforma o **Nero** (advisor sênior de dados) no **motor central** de
um portal de governança de dados para o cliente **LM** (executora: Blite/Venice Tech).
O Nero atua como **Guia** (conduz a operação, desafia decisões) e **Executor** (gera
report quinzenal, documenta o catálogo, avalia maturidade DAMA, mantém a memória viva do
projeto). Idioma do produto: **pt-BR**.

> O Nero está sendo **absorvido pela NEO** (ferramenta central do cliente) e adota o
> design system **NEO / Locavia ("Venice by blite")** — ver [DESIGN.md](DESIGN.md).

## Princípio central — Teoria × Realidade

O kit DAMA é a **teoria/ideal**. O ambiente real do LM só se confirma no discovery. Todo
fato estruturado carrega um **status de verdade** (`template` · `assumido` · `confirmado`
· `lacuna`) + proveniência. Nunca se trata o template como verdade — e isso é código, não
convenção (`src/lib/state/provenance.ts`).

## O que o portal entrega

| Rota | O que faz |
|---|---|
| `/` | **Chat / Guia** — conversa com o Nero (motor central), com streaming e seletor de modelo. |
| `/estado` | **Estado vivo** — dashboard (KPIs, dependências do LM com aging automático, fases, stack com status de verdade, riscos, baseline, RACI) + **radar de maturidade DAMA** + auditoria com undo. |
| `/roadmap` · `/roadmap/[slug]` | 7 fases/gates; painel 360° por fase com checklist interativo e chat escopado. |
| `/catalogo` · `/catalogo/[id]` | **Catálogo vivo** no padrão Golden Example (kit 09): busca/filtros, dicionário nível-campo, lineage, classificação LGPD e **% de completude** calculado. |
| `/report` · `/report/[id]` | **Report quinzenal** montado do estado do banco + narrativas do Nero; persistido para comparação Q(n)×Q(n-1); **export PDF** (CSS print) e "copiar como markdown" (ponte Confluence). |
| `/academia` · `/academia/[trilha]` | **Nero Tutor** — trilhas guiadas com chat tutor escopado (o Nero "dá aula"). |
| `/privacidade` | Guardrails LGPD (kit 06). |

## Arquitetura

- **Nero Core** (`src/lib/nero/`) — **único ponto de IA**. Monta o system prompt (kit `00`
  + base `02`–`09` como prefixo cacheado + estado vivo do banco via `buildMemoriaContext`)
  e chama a Claude API. Loop agêntico em `src/app/api/chat/route.ts`; geração one-shot do
  report em `generate.ts`. UI e features **nunca** chamam o modelo direto.
- **Tools do Nero** (`src/lib/nero/tools.ts`) — 16 ferramentas que **escrevem estado
  auditável**: decisões, stack, dependências, riscos, fases, features/checklist,
  stakeholders, baseline, memória, **maturidade DAMA** (`avaliar_maturidade`) e **catálogo**
  (`documentar_ativo`, `documentar_campo`).
- **Estado vivo** (`src/lib/state/`) — TODA escrita passa por `mutations.ts`: transação +
  `StateVersion` (auditoria/undo) na mesma transação. Entidade nova exige registro em
  `modelOf()` **e** `ENTITY_DATE_FIELDS` no mesmo commit, senão o undo quebra.
- **Kit de conhecimento** (`content/kit/00`–`10`) — o "cérebro" do Nero. `01` é doc
  histórico (estado migrou para o banco); `10` (modo tutor) só entra no chat da Academia.
- **Frontend** (`src/app/`) — Next.js 16 (App Router) + React 19, Tailwind v4 + shadcn/ui,
  seguindo `DESIGN.md`.

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript · Tailwind v4 + shadcn/ui
- `@anthropic-ai/sdk` — Claude. Allowlist: **`claude-haiku-4-5`** (padrão) e
  **`claude-sonnet-4-6`** (`src/lib/nero/core.ts`).
- **Postgres (Neon)** via Prisma. `vercel-build` roda `prisma db push` no deploy —
  mudanças de schema **só aditivas**; backup antes (ver [DEPLOY.md](DEPLOY.md)).
- Fontes (design system NEO): Inter · Newsreader · JetBrains Mono, via `next/font`.

## Comandos

```bash
npm run dev      # desenvolvimento (Turbopack)
npm run build    # build de produção
npm run lint     # ESLint
npm run db:push  # aplica o schema (Prisma) — NUNCA db:reset contra dados reais
npm run db:seed  # seed idempotente (não destrói dados existentes)
```

## Variáveis de ambiente (`.env.local`)

- `ANTHROPIC_API_KEY` — obrigatória para o motor.
- `POSTGRES_PRISMA_URL` (pooled) + `DATABASE_URL_UNPOOLED` (direta) — banco Neon.
- `APP_PASSWORD` + `SESSION_SECRET` — login por senha única (cookie HMAC).
- Opcionais: `NERO_MODEL`, `NERO_MONTHLY_BUDGET_USD`. Demo: `DEMO_SEED_ALLOWED=true`.

## Deploy

O deploy (Vercel) roda `prisma db push` automaticamente. **Backup é obrigatório antes de
qualquer push** que altere schema (branch Neon + `pg_dump`, revisão do SQL com
`prisma migrate diff`). Sequência completa em [DEPLOY.md](DEPLOY.md).
