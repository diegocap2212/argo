# HANDOFF — Portal Nero

Handoff da ferramenta. Contexto do portal: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) e
[`../ONBOARDING.md`](../ONBOARDING.md). Achados abertos:
[`docs/QA-REVIEW.md`](docs/QA-REVIEW.md).

## O que é

Advisor de governança de dados no padrão **DAMA-DMBOK2**, para o cliente LM. Atua como **Guia**
(conduz a operação, desafia decisões) e **Executor** (documenta catálogo, avalia maturidade,
gera report quinzenal, mantém a memória do projeto). Idioma do produto: **pt-BR**.

É a **porta 03** do Portal NEO, servido em `neo-lm.vercel.app/nero`, atrás de duas travas.

## Princípio central — Teoria × Realidade

O kit DAMA é a **teoria**. O ambiente real do LM só se confirma no discovery. Todo fato
estruturado carrega um **status de verdade** (`template` · `assumido` · `confirmado` ·
`lacuna`) mais proveniência. **Isso é código, não convenção** (`src/lib/state/provenance.ts`):
tratar template como verdade é o modo de falha mais grave do produto — ele passaria a inventar
catálogo com cara de fato.

## Superfícies

| Rota | O que entrega |
|---|---|
| `/` | Chat com o Nero (streaming, seletor de modelo) |
| `/estado` | Estado vivo: KPIs, dependências com aging, fases, stack, riscos, RACI + radar DAMA + auditoria com undo |
| `/roadmap`, `/roadmap/[slug]` | 7 fases/gates; painel 360° por fase com checklist e chat escopado |
| `/catalogo`, `/catalogo/[id]` | Catálogo vivo no padrão Golden Example: dicionário nível-campo, lineage, LGPD, % de completude calculado |
| `/biblioteca`, `/biblioteca/[id]` | Base de conhecimento que o Nero consulta (RAG) |
| `/report`, `/report/[id]` | Report quinzenal persistido para comparar Q(n)×Q(n-1); PDF via CSS print; markdown p/ Confluence |
| `/academia`, `/academia/[trilha]` | Nero Tutor — trilhas guiadas com chat tutor escopado |
| `/privacidade` | Guardrails LGPD (kit 06) |
| `/login` | Trava de senha (a segunda; ver Acesso) |

## Arquitetura interna

**`src/lib/nero/core.ts` é o ÚNICO ponto de IA.** O chat (`api/chat/route.ts`, laço agêntico) e
a geração do report (`generate.ts`) passam os dois por `streamTurn`. Isso não é estética: é o
que permite um único guarda cobrir todas as chamadas ao modelo — foi onde o freio de orçamento
entrou.

- **System prompt**: kit `00` + base `02`–`09` como **prefixo cacheado** + estado vivo do banco
  (`buildMemoriaContext`). O kit `01` é doc histórico (o estado migrou para o banco); o `10`
  (modo tutor) só entra no chat da Academia.
- **16 tools que ESCREVEM estado auditável** (`tools.ts`): decisões, stack, dependências,
  riscos, fases, features/checklist, stakeholders, baseline, memória, maturidade DAMA
  (`avaliar_maturidade`), catálogo (`documentar_ativo`, `documentar_campo`).
- **RAG da Biblioteca** (`biblioteca/search.ts`): full-text `portuguese` do Postgres, **sem
  embeddings**. Vetores ficam como opção futura, com critério — ver o blueprint.
- **Estado vivo** (`state/mutations.ts`): TODA escrita é transação + `StateVersion` na mesma
  transação, o que dá auditoria e undo.

## Invariantes — quebrar isso corrompe o produto em silêncio

1. **Entidade nova exige registro em `modelOf()` E em `ENTITY_DATE_FIELDS`, no mesmo commit.**
   Faltando um, **o undo quebra** — e o sintoma aparece só quando alguém tenta desfazer, no pior
   momento. Hoje é comentário; virar guarda de runtime é o item 7 do QA-REVIEW.
2. **UI e features nunca chamam o modelo direto** — sempre via `core.ts`. Furar isso passa por
   fora do freio de orçamento e da contabilização de custo.
3. **Status de verdade em todo fato estruturado.** Sem proveniência, o Nero deixa de ser
   advisor e passa a ser gerador de ficção plausível.
4. **A lista de modelos vive em três lugares** que precisam concordar: allowlist (`core.ts`),
   tabela de preços (`pricing.ts`) e seletor do cliente (`nero-chat.tsx`, separado de propósito
   para não arrastar o SDK da Anthropic para o bundle do browser). Guardado por
   `scripts/test-nero-core.ts`.

## Acesso — duas travas

1. **`neo_session`** — sessão do Portal NEO (login OTP + allowlist). A mesma das outras duas
   ferramentas.
2. **`neo_nero`** — senha específica do Nero, emitida por `/api/gate?scope=nero` no projeto
   `neo-lm`. Existe porque o Nero contém informação proprietária.

`/login` exige só a (1) — é onde a (2) é obtida. O `src/proxy.ts` valida as duas, redundante
com o middleware do portal **de propósito**: se o matcher de lá for mal configurado algum dia, o
app continua fechado.

Antes de 2026-07-26 havia login próprio: senha única compartilhada, cookie de 30 dias, e o
token era HMAC de uma **constante** — sem `exp`, logo **não expirava**. Não reintroduzir.

## Custo — medido, não estimado

Em 2026-07-26, sobre 198 registros de `UsageLog`:

| Métrica | Valor |
|---|---|
| Mês corrente | US$ 6,91 em 80 turnos |
| **Por turno** | **~US$ 0,086** |
| Teto (`NERO_MONTHLY_BUDGET_USD`) | US$ 20 (default) |

**O teto é freio de verdade** desde 2026-07-26. Antes era só medidor: o `BudgetMeter` mostrava
a porcentagem e nada impedia a chamada seguinte — um laço de 8 turnos × 16k `max_tokens` passava
do teto sem obstáculo. Agora `assertWithinBudget()` roda em `streamTurn` e a rota devolve 429.

Duas decisões conscientes: memo de 30s do gasto (sem ele, 8 agregações por conversa) e
**fail-OPEN** se a leitura do gasto falhar — teto é controle de custo, não de segurança, e
transformar queda do Postgres em "o Nero parou" seria pior.

Alavancas de custo, em ordem de eficácia: prompt caching (já ativo — prefixo do kit +
histórico), roteamento Haiku↔Sonnet, e o teto.

## Banco

Postgres do **Neon**, projeto `neon-celeste-globe` (`frosty-star-37790121`), via Prisma.
Descobrir a ligação: `vercel integration list`.

**O deploy não altera schema.** Era `prisma db push` no `vercel-build` — o que fez um deploy de
**preview** escrever schema em **produção** (medido; ver QA-REVIEW §6). Hoje:

```bash
pnpm --filter nero-portal db:migrate:new   # cria, sem aplicar
pnpm --filter nero-portal db:migrate       # aplica
```

Baseline `0_init` aplicado em produção em 2026-07-26, com backup e dados conferidos. Runbook:
[`DEPLOY.md`](DEPLOY.md).

## Deploy

```bash
vercel deploy --local-config nero-portal/vercel.json --prod
```

**A flag não é opcional**: sem ela a CLI usa o `vercel.json` da raiz e roda o build do portal
dentro do projeto do Nero. Root Directory do projeto = `nero-portal`; Git **desconectado**
(deploy deliberado por CLI).

## Testes

```bash
pnpm --filter nero-portal test:core      # 30 asserções, lógica pura, no CI
pnpm --filter nero-portal typecheck
pnpm --filter nero-portal lint
npx tsx scripts/test-state.ts            # DESTRUTIVO — só contra branch do Neon
```

## Pendências

Os 6 itens abertos em [`docs/QA-REVIEW.md`](docs/QA-REVIEW.md). Os de maior impacto:

- **Prompt injection pela Biblioteca** — conteúdo recuperado entra no contexto de um agente com
  16 tools de escrita. Risco contido hoje porque quem popula é a equipe; reavaliar **antes** de
  abrir upload para o cliente.
- **Invariante de `mutations.ts`** sem guarda de runtime.
- **Gate fecha se o Upstash cair** (503) — disponibilidade trocada por anti-brute-force.
