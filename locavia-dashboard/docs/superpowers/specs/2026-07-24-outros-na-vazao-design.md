# Design — "Outros" na vazão (opt-in por time)

**Data:** 2026-07-24
**Escopo:** para times opt-in (começando por Tiguan), incluir os itens "outros" (não-operacionais, exceto Script Manual) **apenas no gráfico "Vazão por tipo"** do detalhe do time, com cada tipo rotulado. Nenhuma outra métrica muda.

## Contexto e problema

Hoje o filtro de escopo operacional (`src/performance/operational.ts`) mantém só 4 tipos (História, Tarefa, Bug, Spike) e é aplicado **na ingestão** dos dados (`useTeamPerformance`/`usePerformancePortfolio`), então TODAS as métricas ignoram os "outros" (GMUD, HOTFIX, UAT, Melhoria, Ideia, Release, Script Manual…).

Alguns times (ex.: Tiguan) entregam esses "outros" como parte real do trabalho e precisam vê-los na vazão. Mas incluí-los globalmente distorceria métricas baseadas em tempo/risco (lead time, previsão, saúde). A decisão: **opt-in por time, e só no gráfico "Vazão por tipo"**, com os tipos rotulados individualmente.

## Objetivo

Para um time na lista opt-in, o gráfico "Vazão por tipo" (`ThroughputByTypeChart`) passa a mostrar, além dos 4 operacionais, os tipos "outros" como fatias próprias **rotuladas pelo nome do tipo** (ex.: "GMUD", "HOTFIX"). Todo o resto continua operacional.

## Não-objetivos

- KPI de vazão (número), "Vazão × Lead Time", previsão (Monte Carlo), saúde, insights, aging, CFD, story points: **inalterados** (seguem operacionais para todos, inclusive o time opt-in).
- Portfólio/home executiva (`usePerformancePortfolio`): inalterado.
- Script Manual: fora (já tem `/modulos`).
- Outros times: inalterados.

## Decisões

- **Lista opt-in:** `['TIGUAN']` (configurável; casada pelo campo `Team`, como o filtro de time em `useTeamPerformance`).
- **"Outros":** `!isOperationalType(t) && !isScriptManual(t)`.
- **Rótulo:** nome real do tipo (limpo), não o balde "Outros".

## Arquitetura

Duas restrições do código atual moldam o design:
1. **Filtro na ingestão:** `useTeamPerformance` faz `setAllItems(operationalItems(data))` — os "outros" são descartados antes de qualquer cálculo. Para tê-los na view, o filtro precisa sair da ingestão e virar derivação.
2. **`normalizedType` colapsa em "Outros":** `byType` (em `computeWeeklyPerformanceTrend`) usa `normalizedType`, que retorna "Outros" para tudo fora dos 4 tipos. Para rotular, precisamos de um labeler que preserve o nome real dos não-operacionais.

### Componentes

1. **Config opt-in** — `src/performance/operational.ts` (co-locado):
   - `TEAMS_WITH_OUTROS_NA_VAZAO: readonly string[] = ['TIGUAN']`.
   - `teamShowsOutrosNaVazao(teamId: string): boolean`.
   - `isOutrosThroughputType(type): boolean` = `!isOperationalType(type) && !isScriptManual(type)` (reusa `isScriptManual` de `performance/moduleErrors.ts`).

2. **Pipeline (`useTeamPerformance`)** — deixar de filtrar na ingestão:
   - `allItems` = dados crus (sem filtro).
   - `items` = `operationalItems(allItems).filter(Team === teamId)` → **alimenta tudo como hoje** (snapshot, trend, cfd, aging, analysis, epics — comportamento idêntico).
   - `viewItems` = para time opt-in, `allItems.filter(Team === teamId && (isOperationalType || isOutrosThroughputType))`; senão `= items`.
   - `viewTrend` = `computeWeeklyPerformanceTrend(viewItems, period, { labelOutros: true })` → **usado só pela "Vazão por tipo"**.
   - Retornar `viewTrend` junto do resto.

3. **`computeWeeklyPerformanceTrend`** — parâmetro opcional de rotulagem:
   - Assinatura nova: `(items, period, opts?: { labelOutros?: boolean })`.
   - Quando `labelOutros`, `byType` usa um labeler que retorna o nome canônico para os 4 operacionais e o **nome real (trim) do tipo** para os demais, em vez de "Outros". Sem a flag, comportamento atual (colapsa em "Outros") — nenhum outro chamador muda.

4. **`ThroughputByTypeChart`** — tipos dinâmicos:
   - Deriva as chaves de tipo da união dos `byType` de todos os pontos (em vez da lista fixa `['História','Bug','Tarefa','Spike']`).
   - Mantém as cores fixas dos 4 operacionais; atribui cores de uma paleta para os tipos "outros"; `name`/legenda = o próprio nome do tipo (rótulo).
   - Empilhamento (`stackId="types"`) preservado.

5. **`TeamDetail.tsx`** — a `ChartCard` "Vazão por tipo" passa a receber `viewTrend` (em vez de `trend`). Para time opt-in, um subtítulo/nota deixa claro que tipos não-operacionais estão incluídos e rotulados.

## Fluxo de dados (resumo)

```
data (cru)
 ├─ items (operacional, por time) ─────────► snapshot, trend, cfd, aging, analysis, epics  (INALTERADO)
 └─ viewItems (opt-in: operacional + outros) ─► viewTrend ─► ThroughputByTypeChart (rotulado)
```

## Verificação

- `npm run test:performance`, `npx tsc -b`, `npm run lint`, `npx vite build` — todos limpos (invariantes do CLAUDE.md).
- Teste manual: `/time/TIGUAN` → "Vazão por tipo" mostra GMUD/HOTFIX/etc. rotulados; KPI de vazão, "Vazão × Lead Time" e previsão **não** mudam. Um time não-opt-in (ex.: `/time/GOL`) segue só com os 4 tipos.
- Regressão: nenhum outro gráfico/número muda; `computeWeeklyPerformanceTrend` sem a flag mantém "Outros" colapsado.

## Arquivos afetados

- `src/performance/operational.ts` — config opt-in + `isOutrosThroughputType`.
- `src/performance/trends.ts` — `computeWeeklyPerformanceTrend` ganha `opts.labelOutros`; labeler que preserva nome real.
- `src/hooks/useTeamPerformance.ts` — ingestão sem filtro; deriva `items`/`viewItems`/`viewTrend`.
- `src/components/PerformanceCharts.tsx` — `ThroughputByTypeChart` dinâmico + paleta para "outros".
- `src/pages/TeamDetail.tsx` — usar `viewTrend` na "Vazão por tipo" + nota para opt-in.
- `README.md` — documentar o comportamento opt-in da vazão.
