@AGENTS.md

# Portal Nero — Advisor de Dados (DAMA-DMBOK2)

Portal web que transforma a **Nero** (um advisor sênior de dados, hoje um Claude
Project) no **motor central** de um portal de governança de dados para o cliente
**LM** (executora: Blite/Venice Tech). O Nero atua como **Guia** (conduz a
operação, desafia decisões) e **Executor** (gera documentos no padrão DAMA, report
quinzenal, atualiza a memória do projeto).

> Idioma do produto e dos artefatos: **pt-BR**.

## Princípio central — Teoria × Realidade
O kit DAMA (`content/kit/08`, `09`) é a **teoria/ideal**. O catálogo real do LM é
desconhecido e só aparece no discovery. Todo fato estruturado carrega um **status de
verdade** (`template/teoria` · `assumido` · `confirmado` · `lacuna`) + proveniência.
Nunca tratar o template como verdade.

## Arquitetura
- **Nero Core** (`src/lib/nero/`) — único ponto de IA. Monta o contexto
  (system prompt = kit `00` + base `02`–`09` [prefixo cacheado] + estado vivo do
  banco via `buildMemoriaContext`) e chama a Claude API. Geração one-shot (report)
  em `generate.ts`.
- **Kit de conhecimento** (`content/kit/00`–`10`) — o "cérebro" do Nero. `01` é
  doc histórico (estado migrou para o banco); `10` (modo tutor) NÃO entra no
  prompt global — só no chat escopado da Academia.
- **RAG da Biblioteca** (`src/lib/biblioteca/search.ts`) — o Nero lê a base de
  conhecimento (tabela `Document`) sob demanda via tools `consultar_biblioteca`
  (full-text `portuguese` do Postgres, sem embeddings) e `ler_documento`. Índice
  compacto no §15 do `buildMemoriaContext`. Vetores (Voyage) ficam como opção
  futura se o corpus exigir recall semântico.
- **Estado vivo** (`src/lib/state/`) — TODA escrita passa por `mutations.ts`:
  transação + `StateVersion` (auditoria/undo). Entidade nova exige registro em
  `modelOf()` e `ENTITY_DATE_FIELDS` no mesmo commit, senão o undo quebra.
- **Frontend** (`src/app/`) — Next.js App Router, Tailwind + shadcn/ui. Rotas:
  `/` chat · `/estado` dashboard + radar DAMA · `/roadmap` · `/catalogo` (Golden
  Example, % de completude calculado) · `/report` (quinzenal persistido, PDF via
  CSS print, markdown p/ Confluence) · `/academia` (trilhas com chat tutor) ·
  `/privacidade`.

## Stack
- Next.js (App Router) + TypeScript · Tailwind v4 + shadcn/ui
- `@anthropic-ai/sdk` — Claude. Allowlist do portal: **`claude-haiku-4-5`**
  (padrão) e **`claude-sonnet-5`**.
  A **fonte de verdade é `NERO_MODELS` em `src/lib/nero/core.ts`**, e o único
  predicado que decide "este modelo pode?" é `isNeroModelId`. Não repita a lista:
  este doc dizia `claude-sonnet-4-6` depois de o código migrar para `claude-sonnet-5`,
  e uma allowlist de modelos defasada num doc que agentes leem é o pior drift possível.
  `NERO_MODEL` fora da lista **aborta o startup em produção** (`VERCEL_ENV=production`);
  fora de produção loga e cai no Haiku.
- Banco: **Postgres (Neon)** via Prisma. `vercel-build` é **`prisma generate && next build`**
  — **não** roda `prisma db push`. Schema muda por `prisma migrate` versionado em
  `prisma/migrations/`, aplicado deliberadamente por um operador; nunca no build.
  *(Este doc afirmava `db push` no deploy: era o comportamento antigo e foi exatamente
  a causa do incidente de preview tocando produção. O `Dockerfile` ainda carrega um
  `db push` no `CMD` e por isso está marcado como NÃO OPERACIONAL — nada o invoca.)*
  Nunca `db:reset` contra dados reais.

## Comandos
Workspace **pnpm** na raiz do monorepo `argo` (`pnpm` não está no PATH — use `corepack pnpm`):

- `corepack pnpm --filter nero-portal dev` — desenvolvimento (Turbopack)
- `corepack pnpm --filter nero-portal build` / `start` — build de produção
- `corepack pnpm --filter nero-portal lint` — ESLint
- `corepack pnpm --filter nero-portal test:core` — 88 checks sem banco: allowlist de
  modelo, preço/orçamento, redação de PII, política de tools, validação do input do chat
- `corepack pnpm --filter nero-portal test:state` — auditoria/undo/reserva de orçamento.
  **Exige Postgres e ESCREVE no banco** — só contra base descartável, nunca produção.

## Variáveis de ambiente (`.env.local`)
- `ANTHROPIC_API_KEY` — obrigatória para o motor.
- `POSTGRES_PRISMA_URL` (pooled) e `DATABASE_URL_UNPOOLED` (direta) — banco Neon.
- `SESSION_SECRET` + `NEO_ORIGIN` — o Nero **não tem login próprio**: valida o token de
  sessão emitido pelo Portal NEO (subchave HKDF de propósito `nero`) e confia na
  identidade que vem dele. **`APP_PASSWORD` foi removida** — não reintroduzir; o doc a
  citava como se o portal ainda tivesse senha única.
- Opcionais: `NERO_MODEL`, `NERO_MONTHLY_BUDGET_USD` (teto global),
  `NERO_USER_MONTHLY_BUDGET_USD` (teto por identidade). (Futura: `VOYAGE_API_KEY`.)

## Convenções
- **Design:** antes de gerar/alterar qualquer tela, ler `DESIGN.md` — o Nero adota
  o design system **NEO / Locavia ("Venice by blite")**: accent verde `#2BE86B`
  (só destaque), neutros quentes, tema claro padrão, Newsreader (títulos/ritual) +
  Inter (UI) + JetBrains Mono (dados). Vereditos/status usam feedback, nunca o accent.
- O Nero Core é o **único** lugar que fala com a Claude API. UI e features nunca
  chamam o modelo direto.
- Antes de mexer na integração com a Claude API, consultar a skill `claude-api`
  (IDs de modelo, streaming, tool use) em vez de assumir de memória.
- Regra de isolamento (kit `00` §1.1): este projeto é **só LM**. Não importar
  contexto/stack de outros clientes.

## Atenção (Next.js)
Esta versão do Next pode ter breaking changes vs. conhecimento prévio — ver
`node_modules/next/dist/docs/` quando em dúvida sobre APIs/convenções.
