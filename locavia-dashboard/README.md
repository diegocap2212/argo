# Locavia Dashboard

Central de performance das equipes de software da Locavia. O produto consolida fluxo, throughput, lead/cycle time, previsibilidade, qualidade dos dados e insights auditáveis por **time + período**.

Os dashboards de Agilista e Time são organizados em **5 abas**: **Entrega**, **Tempo & Gargalos**, **Saúde & Prioridades**, **Épicos** e **Previsão**. Subtarefas e épicos-item são excluídos do dataset pelo JQL do sync (só histórias/bugs/tarefas/etc. contam nas métricas de fluxo).

- **Entrega** — vazão e fluxo: itens novos × entregues, entradas × saídas, CFD, vazão por tipo (e, no agilista, o comparativo dos times).
- **Tempo & Gargalos** — velocidade e onde trava: **cycle time por etapa** (Backlog → Desenvolvimento → QA → Homologação/Deploy, destacando o gargalo), **dispersão de Lead Time** (control chart com P50/P85 e outliers), **Vazão × Lead Time** (série temporal: entregas em barras + Lead Time P85 na linha) e evolução do Cycle Time P85.
- **Saúde & Prioridades** — riscos e ação: **cards mais problemáticos** (itens em andamento há mais tempo, com Key/etapa/dias), **aging heatmap** (WIP por time e faixa de idade), aging do WIP, planejado × realizado, Story Points e insights.
- **Épicos** — iniciativas: **progresso por épico** (concluídos × restantes), **cobertura** (% do trabalho sob um épico vs avulso, em donut) e a **tabela de épicos** (status, progresso, volume, idade). Ver `src/performance/epics.ts` e `src/components/EpicsCharts.tsx`.

As funções de análise são puras, em `src/performance/analytics.ts` e `epics.ts`. Dois campos derivados do changelog/hierarquia do Jira sustentam essas abas, preenchidos pelo sync: **`TimeInStatus`** (horas por etapa, via `sync/status-classification.ts` `classifyStage` + `sync/metrics-calculator.ts`) e **`Epic`/`EpicName`/`EpicStatus`** (épico pai, via `parent` no `sync/field-mapper.ts`).

O charter visual e de vocabulário vive em [`DESIGN.md`](DESIGN.md) e deve ser lido antes de qualquer mudança de interface.

## Rotas

| Rota | Conteúdo |
|---|---|
| `/` | Resumo executivo e matriz de saúde dos times |
| `/time/:teamId` | Performance detalhada de um time |
| `/sm/:smId` | Portfólio de times por agilista |
| `/api-docs` | Swagger UI da API autenticada |

### Incorporação no Portal MMA

A rota de time aceita `?embed=1`, removendo sidebar, topbar, retorno e breadcrumb duplicados para uso dentro da página Métricas do Portal MMA:

```text
https://locavia-dashboard.vercel.app/time/GOL?embed=1
```

A política `frame-ancestors` permite incorporação somente pelos domínios de produção do Portal MMA. A autenticação continua obrigatória; no contexto incorporado, a sessão usa cookie `SameSite=None; Partitioned; Secure`, isolado pelo site superior. Navegadores incompatíveis podem abrir a mesma rota em uma nova aba.

URLs antigas de Cone e releases redirecionam para `/`, preservando favoritos durante a transição.

## Como rodar

```bash
npm install
npm run dev
```

Validações principais:

```bash
npm run test:performance
npm run audit:performance
npx tsc -b
npm run lint
npx vite build
```

O `npm run build` também executa o sync SFMKT e, portanto, requer credenciais. O build da Vercel usa `tsc -b && vite build` diretamente.

## Arquitetura

```text
locavia-dashboard/
├── src/
│   ├── App.tsx                       # Rotas da SPA
│   ├── pages/
│   │   ├── PerformanceDashboard.tsx  # Home executiva
│   │   ├── TeamDetail.tsx            # Detalhe por time + período
│   │   ├── SMDashboard.tsx           # Portfólio do agilista
│   │   └── ApiDocs.tsx               # OpenAPI/Swagger
│   ├── performance/
│   │   ├── types.ts                  # Contrato TeamPerformanceSnapshot
│   │   ├── computeTeamPerformance.ts # Métricas puras de um time
│   │   ├── computePerformancePortfolio.ts # Agregação de todos os times
│   │   ├── health.ts                 # Saúde explicável por sinais
│   │   ├── insights.ts               # Insights determinísticos
│   │   ├── maturity.ts               # Adaptador para o modelo de maturidade
│   │   └── trends.ts                 # Séries semanais e reconstrução do CFD
│   ├── hooks/
│   │   ├── usePerformancePortfolio.ts
│   │   └── useTeamPerformance.ts
│   ├── components/                   # Shell, cards, autenticação e DS Venice
│   │   ├── PerformanceCharts.tsx     # CFD, fluxo, Lead Time e comparação
│   │   └── ContextJourney.tsx        # Torre → Agilista → Time → Métricas
│   ├── services/                     # Dados e autenticação
│   ├── config/                       # Times, agilistas e rótulos
│   ├── types/                        # Tipos do Jira/dataset
│   ├── data.json                     # Fallback versionado do Jira
│   └── data-meta.json                # Horário do último sync
├── api/                              # Funções serverless Vercel
├── sync/                             # Jira e Salesforce Marketplace
├── scripts/                          # Processamento e verificações
├── tests/                            # Playwright E2E
└── tools/                            # Utilitários locais e diagnóstico
```

## Fluxo de dados

```text
Jira / Salesforce
        ↓
sync e normalização
        ↓
Vercel Blob + fallback versionado
        ↓
/api/data autenticado
        ↓
TeamPerformanceSnapshot
        ↓
saúde + insights + maturidade
        ↓
home, portfólio do agilista e detalhe do time
```

O frontend não importa `data.json` diretamente. `dataService` compartilha uma única chamada autenticada a `/api/data` entre os consumidores. Em desenvolvimento sem `VITE_API_URL`, o Vite serve o fallback versionado apenas pelo servidor local, mantendo o dataset fora do bundle do browser.

## Contrato de performance

`TeamPerformanceSnapshot` é a fronteira entre o dataset e a interface. Ele expõe:

- entrega: throughput, Lead Time médio/P85 e Cycle Time P85;
- fluxo: WIP, entradas, saídas, saldo e aging;
- previsibilidade: comprometidos, entregues e taxa;
- qualidade: itens parados, cobertura estrutural e cobertura de Story Points;
- maturidade opcional: nível, score e dimensões.

Todas as regras são funções puras em `src/performance/`, sem dependência de React ou de release.

As telas de gestão priorizam dataviz: CFD, entradas × saídas, Lead Time P85, Cycle Time P85, aging do WIP e comparação entre times. A matriz tabular permanece como diagnóstico detalhado abaixo dos gráficos.

### Regras atuais

- Período padrão: últimas 8 semanas; seleção contínua de 1 a 24 semanas, em passos de uma semana.
- Entrega: item `DONE`, com `Resolved` dentro do período, exceto `CANCELADO`/`DESCARTADO`.
- WIP: itens `IN_PROGRESS` ativos no final do período.
- Aging: WIP iniciado/criado há mais de 15 dias.
- Saldo de fluxo: entradas menos saídas.
- Previsibilidade: compromissos do período entregues no mesmo período.
- Saúde: classificação explicável baseada em aging, Lead Time, saldo, qualidade e previsibilidade; os riscos permanecem separados.
- Insights: regras determinísticas, ordenadas por severidade e comparadas ao período anterior.

Os limites são centralizados em `health.ts` e `insights.ts`, facilitando revisão com a área de negócio.

## Integração de maturidade

O adaptador em `src/performance/maturity.ts` define `MaturityProvider`. O modelo externo deve receber um snapshot imutável e devolver:

```ts
interface MaturityAssessment {
  level: number;
  score: number;
  dimensions: Record<string, number>;
}
```

Quando o modelo estiver disponível, ele poderá ser conectado sem importar regras nos componentes ou alterar o contrato da home.

## Sincronização

- `npm run sync:jira`: busca e normaliza issues do Jira Grupo LM.
- `npm run sync:sfmkt`: sincroniza Salesforce Marketplace.
- `npm run sync`: executa o sync Jira local.
- `npm run audit:performance`: valida o dataset gerado pelo ponto de vista do produto.

Invariantes importantes:

- **Time = squad, derivado do campo Time do Jira (cf11795).** `sync/field-mapper.ts` resolve o time por: projeto dedicado (prefixo `SFMKT`/`SFV`) → tabela explícita `TIME_FIELD_TO_TEAM` (cf11795) → `SEM TIME`. Não deriva time de jornada nem de prefixo ambíguo (`RM`/`CTO`/`MS` aparecem em vários times).
- **Jornada (cf12386) é dimensão de negócio, nunca time.** A mesma jornada (Compras, Estoque, Contratos…) é atendida por vários squads; é preservada em `DashboardItem.Jornada`. Auditar com `tools/debug/audit-jornada-time.ts` (read-only, não grava no Blob).
- Itens sem campo Time confiável caem em `SEM TIME` (sinal de qualidade de dado a ser corrigido no Jira), em vez de inflar um squad.
- `Resolved` vem de `resolutiondate`, nunca da primeira transição para um status parecido com concluído.
- Classificação de status vive em `sync/status-classification.ts`.
- Story Points vivem em `sync/story-points.ts`.
- SFMKT aceita somente o projeto/prefixo `SFMKT`; não reintroduzir APV/FUSCA.
- Datas usam ISO `YYYY-MM-DD`/ISO 8601 e os limites de período são fechados em UTC.

## Autenticação e ambiente

Variáveis principais:

| Variável | Uso |
|---|---|
| `SESSION_SECRET` | Assinatura HMAC da sessão |
| `DASHBOARD_PASSWORD` | Senha do dashboard |
| `BLOB_READ_WRITE_TOKEN` | Dataset privado no Vercel Blob |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis/Upstash |
| `JIRA_BASE_URL` / `JIRA_USER_EMAIL` / `JIRA_API_TOKEN` | Sync Jira |
| `GITHUB_TOKEN` | Disparo manual do workflow de sync |

Sem `SESSION_SECRET` e `DASHBOARD_PASSWORD`, o gate fica aberto para desenvolvimento local. Em produção, ambas devem estar configuradas.

## Testes

`npm run test:performance` cobre contrato, período, último dia em UTC, descartes, fluxo, percentis, previsibilidade, qualidade, saúde, insights, portfólio e adaptador de maturidade. `npm run audit:performance` executa invariantes sobre todo o dataset versionado.

Os testes Playwright cobrem a navegação e as páginas principais e usam o fallback local de dados, sem Redis ou API externa. Scripts históricos em `tools/` ficam fora do lint do produto.

## Governança

- Mudanças estruturais devem atualizar este README.
- Rode `tsc -b`; `tsc --noEmit` no root não verifica os projetos referenciados.
- Não grave segredos no repositório.
- Preserve o contrato `TeamPerformanceSnapshot`; extensões devem ser aditivas sempre que possível.
- Releases podem permanecer como campo histórico no dataset/sync, mas não são eixo de navegação nem de cálculo do produto.
