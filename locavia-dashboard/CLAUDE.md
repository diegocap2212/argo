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

- `Resolved` vem diretamente de `resolutiondate` do Jira. Nunca derivar da primeira transição para um status semelhante a DONE.
- `DONE/IN_PROGRESS/TODO` vive somente em `sync/status-classification.ts`.
- QA, deploy e homologação não são DONE sem resolução/statusCategory concluído.
- `DESCARTADO` e `CANCELADO` não contam como entrega.
- Story Points são extraídos somente por `sync/story-points.ts`; os campos Jira são `customfield_10026` e `customfield_10016`.
- Períodos usam ISO 8601 e o fim do dia deve ser fechado em UTC para não perder datas em fusos negativos.
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
- Sessão HMAC em cookie HttpOnly.
- O gate local é fail-open somente quando `SESSION_SECRET` não está configurado; em produção é obrigatória (fail-closed). O ramo legado `DASHBOARD_PASSWORD` foi removido — não reintroduzir.

## Comentários legados

- Comentários existentes permanecem no Redis Hash e a API deve preservar leitura compatível.
- Escritas são atômicas por campo (`HSET`), nunca read-modify-write do blob completo.
- Não reutilizar IDs de SM como IDs de time.

## Verificação mínima

```bash
npm run test:performance
npx tsc -b
npm run lint
npx vite build
```

O lint global pode encontrar dívida em scripts históricos fora do produto; novos arquivos e arquivos alterados devem passar sem erros.
