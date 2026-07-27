# Instruções de engenharia — locavia-dashboard

## Governança

Toda mudança estrutural deve atualizar o `README.md`: rotas, pastas relevantes, variáveis, scripts, build/deploy e regras de sincronização.

Antes de criar ou alterar qualquer tela, leia `DESIGN.md`; ele é a fonte de verdade visual e de vocabulário do produto.

## Direção do produto

- A unidade central é **time + período**, nunca release + time.
- `/` é a home executiva de performance.
- `/time/:teamId` é o detalhe do time.
- `/sm/:smId` é o portfólio do agilista.
- Releases podem existir como dado histórico vindo do Jira, mas não são eixo de navegação ou cálculo.
- Métricas, saúde, insights e maturidade devem consumir `TeamPerformanceSnapshot` em `src/performance/`.
- Regras de negócio devem ser funções puras e testáveis, não cálculos dentro de componentes React.

## TypeScript e build

- TypeScript strict, `noUnusedLocals` e `noUnusedParameters`: zero erros.
- Rode `tsc -b`; `tsc --noEmit` no root é no-op por causa dos project references.
- Vercel: `tsc -b && vite build`.
- `npm run build` local também roda `sync:sfmkt` e exige credenciais.
- `vite.config.ts` usa `loadEnv()` para o proxy local.

## Invariantes de métricas

- `Resolved` vem diretamente de `resolutiondate` do Jira. Nunca derivar da primeira transição para
  um status semelhante a DONE, **e nunca cair para `UpdatedAt`**. Existia
  `if (StatusCategory === 'DONE' && !Resolved) Resolved = UpdatedAt` em `metrics-calculator.ts`:
  inventava a data de entrega, movia throughput/lead time para a semana do último toque no card, e
  tornava `DataQuality.missingResolutionDate` estruturalmente inalcançável (a flag é
  `DONE && !Resolved`, calculada DEPOIS). Item DONE sem `resolutiondate` fica com `Resolved = null`,
  sai das métricas de entrega e aparece como dívida de higiene.
- `LeadTime` usa diferença **assinada**. `Math.abs` transformava `Resolved < Created` — dado
  impossível — numa duração positiva plausível. Intervalo negativo vira `LeadTime = null` +
  `DataQuality.negativeLeadTime`.
- Descarte tem **um só predicado**: `isDiscardedStatus` em `src/performance/discard.ts`. Nenhum
  consumidor pode ter a sua própria lista (`epics.ts` tinha um `Set` de match exato, então
  `'DESCARTADOS'` e `'CANCELADO ❌'` eram descartados numa métrica e contados na outra).
- `DataQuality.historyComplete` diz se o changelog daquele item veio **completo** (via
  `bulkFetchChangelogs`). `TimeInStatus` e `TimeInTodo` derivam do changelog: com histórico parcial
  saem errados parecendo certos. O padrão é `false` — quem sabe é o `sync-jira.ts`, depois de buscar.
- `DONE/IN_PROGRESS/TODO` vive somente em `sync/status-classification.ts`.
- QA, deploy e homologação não são DONE sem resolução/statusCategory concluído.
- `DESCARTADO` e `CANCELADO` não contam como entrega.
- Story Points são extraídos somente por `sync/story-points.ts`; os campos Jira são `customfield_10026` e `customfield_10016`.
- **Períodos são semiabertos: `[start, end)`.** `end` é EXCLUSIVO. A única fonte é
  `src/performance/period.ts` (`makeInPeriod`, `previousPeriodOf`, `endOfDayExclusiveUTC`) e
  snapshot, comparação e trend usam a mesma. Quem monta o período é o CHAMADOR: `computeTeamPerformance`
  não estica o `end`.
  *Esta invariante era o oposto ("o fim do dia deve ser fechado em UTC") e a versão fechada foi a
  causa de contagem dupla: com `previousPeriod.end === period.start` e intervalo fechado nas duas
  pontas, todo item resolvido no instante de fronteira entrava nos DOIS períodos e inflava os
  deltas e os insights. Ao converter, `'2026-06-30'` como fim fechado passa a ser `'2026-07-01'`
  como fim exclusivo.*
- Monte Carlo usa PRNG com seed derivada do dataset (`mulberry32`), nunca `Math.random` — previsão
  que muda a cada render não é previsão.
- Saúde deve manter os riscos separados e explicáveis; não esconder dimensões em uma média opaca.
- Insights são determinísticos e devem apontar para os dados que os sustentam.

## Invariantes do sync

- `src/data-meta.json` contém `syncedAt` gravado por `sync/sync-jira.ts` e deve existir no repositório.
- SFMKT entra pelo sync principal, fora dos filtros específicos dos projetos LM.
- `field-mapper.ts` força `Team='SFMKT'` para prefixo SFMKT.
- A configuração SALESFORCE aceita somente SFMKT; não reintroduzir APV/FUSCA.
- Subtarefas são excluídas pelo JQL.
- Credenciais do Jira Grupo LM vivem em secrets e `.env.local`; nunca commitar.

## Dados e autenticação

- O browser carrega dados por `/api/data`; não importar `src/data.json` no bundle.
- `/api/data` usa Blob privado com fallback versionado e exige sessão quando o gate está configurado.
- **O fallback se declara.** A resposta é `{items, syncedAt, source: 'blob'|'fallback', stale, count, hash}`
  e no fallback `syncedAt` é **`null`** — nunca o de `src/data-meta.json`, que é commitado a cada hora
  e diria "sincronizado agora" sobre itens congelados de `src/data.json`. O ETag deriva de
  `source+hash+count+syncedAt`; derivar só de `syncedAt` fazia o cache confirmar a mentira.
- Sessão HMAC em cookie HttpOnly.
- O gate local é fail-open somente quando `SESSION_SECRET` não está configurado; em produção é obrigatória (fail-closed). O ramo legado `DASHBOARD_PASSWORD` foi removido — não reintroduzir.

## Comentários legados

- Comentários existentes permanecem no Redis Hash e a API deve preservar leitura compatível.
- Escritas são atômicas por campo (`HSET`), nunca read-modify-write do blob completo.
- Não reutilizar IDs de SM como IDs de time.

## Verificação mínima

```bash
# workspace pnpm na raiz do monorepo; `pnpm` não está no PATH desta máquina
corepack pnpm --filter locavia-dashboard test:performance
corepack pnpm --filter locavia-dashboard test:sync          # 32 invariantes de sync + contrato do dataset
corepack pnpm --filter locavia-dashboard exec tsc -b        # src + sync/scripts/tools (tsconfig.tools.json)
corepack pnpm --filter locavia-dashboard lint
corepack pnpm --filter locavia-dashboard exec vite build
```

**Verifique por código de saída, não por grep na saída.** Um `grep -ci '\berror\b'` já reportou
"0 erros" enquanto o eslint estava **crashando** — `\berror\b` não casa dentro de "TypeError".

`sync/`, `scripts/` e `tools/` **não são exceção**: entraram no lint (as duas entradas em
`globalIgnores` foram removidas) e no typecheck (`tsconfig.tools.json`). O código que autentica no
Jira, classifica dado e publica o dataset não pode ter menos controle estático que a UI.
