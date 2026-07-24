# Design — Pré-sessão do SM

**Data:** 2026-07-24
**Escopo desta iteração:** captura do artefato de pré-sessão, amarrado ao fluxo. Comparativo pré × time, rename Homologação→Validação e votação do time dentro da ferramenta ficam para iterações seguintes.

## Contexto e problema

O processo real de aplicação do modelo tem 3 etapas: **pré-sessão → sessão com o time → validação**. Na pré-sessão o SM faz uma análise prévia (usando os indicadores já levantados na ferramenta) e chega com uma **nota provisória + argumento** por dimensão, para balizar o time e evitar notas sem embasamento.

Hoje a ferramenta só modela **sessão** (SM registra o consenso) e **homologação** (AM ajusta). Não existe lugar para a pré-sessão — o ciclo nasce direto em `session`. Falta a amarração da pré-sessão no fluxo de UI.

## Objetivo

Capturar, por ciclo e por dimensão, a avaliação prévia do SM (**estágio 1–4 + argumento**), informada pelos indicadores/âncoras já existentes, e amarrá-la como etapa explícita **antes** da sessão com o time. O dado fica pronto para alimentar a comparação pré × time na Validação (iteração futura).

## Não-objetivos (fora de escopo agora)

- Comparação pré × time e "radar de atenção" na Validação.
- Rename Homologação → Validação.
- Trazer a votação anônima do time para dentro da ferramenta (segue no Mentimeter).
- Qualquer mudança na tela de sessão/consenso atual.

## Modelo de dados

Nova tabela `pre_session_assessments`:

| coluna | tipo | nota |
|---|---|---|
| `cycle_id` | uuid FK → assessment_cycles(id) | parte da PK |
| `dimension_id` | uuid FK → dimensions(id) | parte da PK |
| `sm_stage` | int, CHECK 1..4 | estágio provisório |
| `rationale` | text, NOT NULL | argumento do SM |
| `created_by` | uuid → auth.users | quem preencheu |
| `updated_at` | timestamptz default now() | |

- **PK composta** `(cycle_id, dimension_id)` → upsert por dimensão (`onConflict: cycle_id,dimension_id`), espelhando `proposals`.
- Espelhar `proposals` deixa a comparação futura pré × time como um join simples por `(cycle_id, dimension_id)`.
- **Alternativa descartada:** reusar a tabela morta `votes` — semântica diferente (voto individual sigiloso, já removido). Mantida morta.

## Máquina de estados

- `CycleStatus` (`src/types/mma.ts`) ganha **`pre_session`**.
- `CYCLE_TRANSITIONS`:
  - `pre_session: ["session"]`
  - `session: ["homologation"]` (inalterado)
  - `homologation`, `official`, `archived` inalterados.
- Fluxo completo: **Pré-sessão → Sessão → Homologação → Oficial → Arquivado**.
- `useStartCycle` passa a inserir o ciclo com `status: "pre_session"` (hoje `"session"`).
- A transição `pre_session → session` é a ação **"Iniciar sessão com o time"** (usa o `useTransitionCycle` existente); só SM/AM.
- **Constraint no banco:** o `assessment_cycles.status` tem um CHECK `status in ('session','homologation','official','archived')` com default `'session'` (definido em `20260710130000`). A migration precisa: `drop constraint assessment_cycles_status_check` e recriá-lo como `check (status in ('pre_session','session','homologation','official','archived'))`, e `alter column status set default 'pre_session'`.
- **Migração de dados:** aditiva. Ciclos já existentes (em `session`/`homologation`/etc.) não são tocados nem retroagidos.

## Freeze (imutabilidade) — server-side via RLS

Espelha o padrão de `proposals`. Helpers existentes: `is_member`, `is_sm`, `is_am`, `is_portal_admin`.

- `presession_read` (SELECT): `is_member(c.team_id) or is_portal_admin()`.
- `presession_write` (ALL): `(is_sm(c.team_id) or is_am(c.team_id)) and c.status = 'pre_session'` — em `using` e `with check`.

Consequência: assim que o ciclo transiciona para `session`, a pré-sessão vira **read-only** automaticamente. Não depende do client — não dá para ajustar a pré depois de ver o time.

## UI / amarração

- **Jornada** (`src/pages/squad/Jornada.tsx`): o botão "Iniciar" cria o ciclo em `pre_session` (via `useStartCycle`, já ajustado). Copy da jornada reflete a nova primeira etapa.
- **Aba "Sessão"** (`src/pages/squad/Sessao.tsx`) — já troca de conteúdo por `cycle.status`. Passa a tratar:
  - `pre_session` → **editor de pré-sessão**:
    - Só SM/AM edita. Membros veem estado de espera ("Pré-sessão em preparação pelo facilitador").
    - Por dimensão (agrupado por eixo, como hoje): indicadores/âncoras via `useTeamAnchors(teamId)` (nome, valor mais recente, verdict, unidade) + as 4 descrições de estágio via `useStageDescriptions` + seletor de **estágio 1–4** + campo de **argumento** (`rationale`).
    - Indicador de progresso **X/10** dimensões pré-avaliadas.
    - Botão **"Iniciar sessão com o time"** → transição `pre_session → session` (congela). **Habilitado só com 10/10** dimensões tendo estágio **e** argumento preenchidos.
  - `session` → tela de consenso atual, **inalterada**.
  - demais estados → mensagens atuais, inalteradas.

## Hooks

Novo `src/hooks/usePreSession.ts`, espelhando `useProposals`/`useSaveProposal`:
- `usePreSessionAssessments(cycleId)` → leitura (`select *` filtrando `cycle_id`).
- `useSavePreSessionAssessment(cycleId)` → upsert `{ cycle_id, dimension_id, sm_stage, rationale, created_by }` com `onConflict: "cycle_id,dimension_id"`; invalida `["pre-session", cycleId]` no sucesso.

## Verificação

- `npx tsc -b`, `npm run lint`, `npx vite build` limpos (invariantes do CLAUDE.md).
- Migration aplicada via `supabase db push` (ou MCP `apply_migration`), timestamp real maior que a última (`20260712210000`).
- Teste manual do fluxo: criar ciclo → cai em `pre_session` → preencher as 10 dimensões (estágio + argumento) → "Iniciar sessão" habilita → transiciona para `session` → confirmar que a pré ficou read-only (tentativa de escrita barrada pela RLS) e que a tela de consenso aparece normal.
- Regressão: membro não-facilitador não edita a pré; ciclos antigos seguem funcionando.

## Arquivos afetados (previsão)

- `supabase/migrations/<ts>_pre_session.sql` — tabela `pre_session_assessments` + RLS (`presession_read`/`presession_write`) + ajuste do CHECK e default de `assessment_cycles.status` para incluir `pre_session`. Timestamp real > `20260712210000`.
- `src/types/mma.ts` — `CycleStatus` + `CYCLE_TRANSITIONS`.
- `src/hooks/useCycleData.ts` — `useStartCycle` cria em `pre_session`.
- `src/hooks/usePreSession.ts` — novo.
- `src/pages/squad/Sessao.tsx` — branch de `pre_session`.
- `src/pages/squad/Jornada.tsx` — copy/estado inicial.
- `README.md` — documentar a nova etapa (governança do CLAUDE.md).
