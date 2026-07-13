# Portal MMA

Portal do **Modelo de Maturidade Ágil** da LM Mobilidade: cada squad passa por
uma **sessão colaborativa** (o facilitador apresenta as 10 dimensões e registra
a nota de consenso do grupo), a nota é **homologada** por um Agile Master, o
ciclo é **oficializado** (gerando o plano de kaizens), e a evolução é comparada
quarter a quarter. Métricas objetivas do **Jira** entram como "âncoras" que
sustentam ou contestam a nota — sem nunca substituí-la.

> **Documentação técnica completa**: veja **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**
> (stack, banco/RLS, rotas, design system, Edge Function, governança) e
> **[`STATUS.md`](./STATUS.md)** (estado atual, pessoas/acesso, pendências).
> Comece por eles se for herdar o projeto.

## Stack

Vite + React 18 + TypeScript · Tailwind + shadcn/ui · React Router · TanStack
Query · Supabase (Postgres + Auth + Edge Functions) · deploy na Vercel.

## Rodando localmente

Pré-requisitos: **Node 18+** e npm.

```bash
npm install
cp .env.example .env      # preencha com as chaves do Supabase (ver .env.example)
npm run dev               # sobe em http://localhost:8080
```

## Scripts

| Comando | O quê |
|---|---|
| `npm run dev` | Dev server (porta 8080) |
| `npm run build` | Build de produção (Vite) |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`) — **o build não checa tipos, rode isto antes de subir** |
| `npm run lint` | ESLint |
| `npm run preview` | Servir o build localmente |

**Antes de qualquer deploy**: `npm run typecheck && npm run build` limpos.

## Variáveis de ambiente

Só o front precisa de env local (ver `.env.example`): `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` (chave anon/publishable, pública — protegida por
RLS). Os segredos server-side (service_role, credenciais do Jira) vivem **apenas**
nos *secrets* das Edge Functions do Supabase, nunca no repositório.

## Deploy

- **Front**: Vercel, deploy automático a cada push na `main`.
- **Banco / migrations**: `supabase db push` (CLI linkada ao projeto).
- **Edge Function** (`sync-anchors`, integração Jira): `supabase functions deploy sync-anchors` + `supabase secrets set ...`. Detalhes e a lista de secrets em `ARCHITECTURE.md` §9.

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
└── functions/sync-anchors/   Edge Function (Jira → âncoras)
```

Detalhes de arquitetura, modelo de acesso (papéis por squad + RLS) e as
armadilhas de manutenção conhecidas: **`ARCHITECTURE.md`**.
