# Portal MMA

Portal do **Modelo de Maturidade Ágil** da LM Mobilidade: cada squad passa por
uma **pré-sessão** (o facilitador registra sua análise prévia — estágio provisório
+ argumento por dimensão, com os indicadores à vista — e ao concluir as 10 abre a
sessão), uma **sessão colaborativa** (o facilitador apresenta as 10 dimensões e
registra a nota de consenso do grupo), a nota é **homologada** por um Agile Master, o
ciclo é **oficializado** (gerando o plano de kaizens), e a evolução é comparada
quarter a quarter. O estado `pre_session` é o inicial do ciclo; a pré-sessão congela
(RLS) ao transicionar para `session`. Métricas objetivas do **Jira** entram como "âncoras" que
sustentam ou contestam a nota — sem nunca substituí-la.

> **Documentação técnica completa**: veja **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**
> (stack, banco/RLS, rotas, design system, Edge Function, governança) e
> **[`STATUS.md`](./STATUS.md)** (estado atual, pessoas/acesso, pendências).
> Comece por eles se for herdar o projeto.

## Stack

Vite + React 18 + TypeScript · Tailwind + shadcn/ui · React Router · TanStack
Query · Supabase (Postgres + Auth + Edge Functions) · deploy na Vercel.

## Rodando localmente

Este app é um workspace do monorepo `argo`. **Instale na raiz do monorepo, não aqui**
(`corepack pnpm install --frozen-lockfile`) — não existe `package-lock.json`, e rodar
`npm install` nesta pasta cria um `node_modules` divergente do lockfile do workspace.

```bash
cp .env.example .env                          # chaves do Supabase (ver .env.example)
corepack pnpm --filter maturitymodel dev      # sobe em http://localhost:8080
```

## Scripts

Todos via `corepack pnpm --filter maturitymodel <script>`:

| Comando | O quê |
|---|---|
| `dev` | Dev server (porta 8080) |
| `build` | Build de produção (Vite) |
| `typecheck` | **`tsc -b`** — compila `src`, os testes e as ferramentas de verdade |
| `lint` | ESLint |
| `preview` | Servir o build localmente |
| `test:journey` | Contrato da jornada do ciclo (21 checks, sem banco) |
| `test:anchors` | Fórmulas das âncoras do Jira (17 checks, sem banco) |
| `test:migrations` | Aplica todas as migrations num Postgres efêmero (PGlite) |
| `test:rls-local` | Matriz de RLS/papéis no Postgres efêmero (88 checks) |
| `test:rls` | Mesma matriz contra um Supabase real (exige envs) |

**Antes de qualquer deploy**: `typecheck` + `build` + os quatro testes locais limpos.

> **Sobre o `typecheck`:** até 2026-07-27 o script era `tsc --noEmit`, e o `tsconfig.json`
> deste app é `files: []` + project references — a combinação **não verifica nada** (o
> `--noEmit` ignora as referências). O script passava verde enquanto a aplicação tinha
> **201 erros de tipo em 43 arquivos**. Hoje é `tsc -b`, que segue as referências.
> Se alguém trocar de volta, o verde volta a ser falso.

## Variáveis de ambiente

Só o front precisa de env local (ver `.env.example`): `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` (chave anon/publishable, pública — protegida por
RLS). Os segredos server-side (service_role, credenciais do Jira) vivem **apenas**
nos *secrets* das Edge Functions do Supabase, nunca no repositório.

## Deploy

- **Front**: hoje sai no build composto do monorepo `argo` (rota `/maturity/**` do Portal NEO),
  **não** por deploy próprio deste repositório. O domínio antigo
  `maturitymodel-ashen.vercel.app` foi descontinuado no cutover.
- **Banco / migrations**: `supabase db push` (CLI linkada ao projeto).
- **Edge Functions da integração Jira — são DUAS**, e a diferença é a fronteira de autorização:

  ```bash
  supabase functions deploy sync-anchors-user   # JWT do usuário; exige SM do squad ou AM/admin
  supabase functions deploy sync-anchors-cron   # header com ANCHOR_SYNC_CRON_SECRET (Vault)
  supabase secrets set JIRA_BASE_URL=... JIRA_EMAIL=... JIRA_API_TOKEN=... \
                       SB_URL=... SB_SERVICE_ROLE=... SB_ANON_KEY=... \
                       ANCHOR_SYNC_CRON_SECRET=...
  ```

  A função única `sync-anchors` **não existe mais**: ela recebia `service_role` por env e
  autorizava com ela, então **qualquer pessoa com a anon key** (que é pública, e estava
  hardcoded numa migration do cron) conseguia disparar sync de qualquer squad. Detalhes e a
  lista completa de secrets em `ARCHITECTURE.md` §9.

## Dashboard Locavia incorporado

A rota `/s/:teamId/metricas` incorpora a visão `/time/:locaviaTeamId?embed=1` do Dashboard Locavia. Gol, Optimus, Nivus, Jetta, Scania, Parati, SF Cloud e SF Vendas possuem mapeamento automático; `teams.locavia_team_key` pode sobrescrever o identificador em novos squads.

O Locavia mantém autenticação própria dentro do frame e a tela oferece “Abrir no Locavia” como alternativa para navegadores que bloqueiam cookies particionados. A incorporação é autorizada pela política `frame-ancestors` do dashboard.

## Estrutura (resumo)

```
src/
├── pages/            telas globais (Login, Inicio, Torre, Guia, AdminMMA) + pages/squad/ (o ciclo)
├── components/
│   ├── ui/           shadcn/ui (gerado)
│   ├── layout/       AppShell, SquadSubNav
│   └── mma/          componentes do domínio (SquadSwitcher, CycleJourney, ...)
├── hooks/            acesso a dados (TanStack Query), 1 por área
├── types/mma.ts      tipos do domínio + máquina de estados do ciclo
├── theme/            claro/escuro
└── integrations/supabase/   client + tipos gerados

supabase/
├── migrations/       histórico do schema (as `2026071012/13...mma_*` são as do Portal MMA;
│                     as anteriores são do Maturity Model legado — ver ARCHITECTURE §8.1)
└── functions/
    ├── _shared/              JQL, normalize, EXTRACTORS, verdict, authz (lógica comum)
    ├── sync-anchors-user/    fronteira: JWT do usuário + papel no squad
    └── sync-anchors-cron/    fronteira: secret exclusiva do cron

tests/
├── journey-contract.ts   jornada do ciclo (sem banco)
├── anchor-formulas.ts    fórmulas das âncoras (sem banco)
└── pg/                   Postgres efêmero (PGlite): apply-migrations, rls-local
```

Detalhes de arquitetura, modelo de acesso (papéis por squad + RLS) e as
armadilhas de manutenção conhecidas: **`ARCHITECTURE.md`**.
