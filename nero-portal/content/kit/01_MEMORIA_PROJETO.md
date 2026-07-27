> ⚠️ **DOC HISTÓRICO — NÃO É MAIS A FONTE DA VERDADE.** A memória viva do projeto agora é
> **gerada do banco de dados** e injetada no system prompt do Nero por `buildMemoriaContext()`
> (`src/lib/state/queries.ts`). Este arquivo não é mais carregado pelo motor; serve só como
> referência da estrutura original §0–§12. Edite o estado pelas ferramentas do Nero ou pela
> página `/estado`.

# 01 — MEMÓRIA DO PROJETO (estrutura de referência)

Arquivo-estado original. Estrutura §0–§12 reproduzida pelo renderer a partir do banco.

**Última atualização:** AAAA-MM-DD | **Atualizado por:** ____

---

## 0. Metadados

| Campo | Valor |
|---|---|
| Projeto | Habilitação, Governança e Aculturamento — Data Lake LM |
| Cliente | LM |
| Executora | Blite/Venice Tech |
| Início (kickoff) | AAAA-MM-DD |
| Duração | 6 meses |
| Fase atual | Fase 0 — Mobilização & Discovery |
| Status geral (RAG) | 🟡 |
| Gestão (ferramenta) | A definir com a equipe LM (hierarquia ágil genérica: Epic → Feature → História → Task) |

## 1. Resumo do projeto (1 parágrafo)

Apoiar a habilitação e o aculturamento das áreas de negócio do cliente LM no uso do Data Lake, com foco em autonomia no consumo de dados, governança/documentação dos ativos (catálogo, dicionário, glossário, ownership), boas práticas de consulta e cultura data-driven, deixando ao final um operating model sustentável e um roadmap de maturidade.

## 2. Stack & ambiente do Data Lake [CRÍTICO — PREENCHER NA SEMANA 1]

| Item | Resposta | Status |
|---|---|---|
| Plataforma do Data Lake (Databricks/Synapse/BigQuery/Athena-Trino/Snowflake/outro) | ____ | ❓ pendente |
| Engine de consulta / dialeto SQL | ____ | ❓ |
| Formato de armazenamento (Delta/Iceberg/Parquet/Hudi) | ____ | ❓ |
| Estratégia de particionamento usada hoje | ____ | ❓ |
| Ferramenta de catálogo existente (Unity/Purview/Glue/outro) | ____ | ❓ |
| Portal escolhido (SharePoint/Confluence/outro) | ____ | ❓ |
| BI / ferramenta de consumo das áreas | ____ | ❓ |
| Como medir uso (logs de query, usuários ativos) | ____ | ❓ |

> ⚠️ Sem o stack confirmado, Fase 3 (boas práticas/partições/joins) não pode ser finalizada. Tratar como bloqueio P0.

## 3. Stakeholders & RACI

| Nome | Papel | Lado (LM/Blite) | Responsabilidade no projeto |
|---|---|---|---|
| ____ | Sponsor | LM | Aprova escopo, destrava acessos |
| ____ | Analista de GOV | Blite | Documentação, governança (a chegar) |
| ____ | Owner de domínio | LM | Valida catálogo/dicionário do domínio |
| ____ | Eng. de dados / plataforma | LM | Acessos, info de stack |

## 4. Log de decisões

| Data | Decisão | Por quê | Quem |
|---|---|---|---|
| AAAA-MM-DD | ex.: Glossário de negócio incluído no escopo da Fase 2 | Sustenta cultura data-driven | ____ |

## 5. Premissas & decisões pendentes

| # | Premissa / pendência | Impacto se falsa | Quem decide | Prazo |
|---|---|---|---|---|
| P1 | Stack do Data Lake assumido como ____ | Reescrever Fase 3 | LM Eng. | Semana 1 |
| P2 | Portal será ____ | Refazer Fase 1 | Sponsor LM | Semana 1 |

## 6. Estado por fase / epic

| Fase / Epic | Status | % | Comentário |
|---|---|---|---|
| Fase 0 — Mobilização & Discovery | 🟡 em andamento | 0% | |
| Fase 1 — Base de Conhecimento | ⚪ não iniciada | 0% | |
| Fase 2 — Governança & Metadados | ⚪ | 0% | |
| Fase 3 — Boas Práticas & Performance | ⚪ | 0% | bloqueada por stack |
| Fase 4 — Capacitação & Aculturamento | ⚪ | 0% | |
| Fase 5 — Adoção & Evolução | ⚪ | 0% | |
| Fase 6 — Consolidação & Sustentação | ⚪ | 0% | |

## 7. 🔴 Registro de Dependências do Cliente LM (revisar TODA sessão)

> Regra: cada linha tem um trilho paralelo que avança sem o cliente. Aging > 5 dias úteis → vermelho no report.

| # | O que precisamos do LM | Solicitado em | Status | Aging (dias) | Trilho paralelo (avança sem LM) |
|---|---|---|---|---|---|
| D1 | Acesso ao Data Lake p/ equipe | AAAA-MM-DD | aguardando | 0 | Montar estrutura do dicionário com placeholders |
| D2 | Lista priorizada de tabelas | | | | Definir critério de priorização e template |
| D3 | Nomes dos owners por domínio | | | | Rascunhar matriz de domínios candidatos |

## 8. Riscos & blockers

| # | Risco/Blocker | Sev | Mitigação | Dono |
|---|---|---|---|---|
| R1 | Fricção do cliente atrasa acessos | Alta | Trilho paralelo + escalonamento quinzenal | |
| R2 | Stack desconhecido trava Fase 3 | Alta | Discovery na Semana 1 | |
| R3 | Documentação sem ownership apodrece | Média | Operating model na Fase 6 | |

## 9. Próximas ações (curto prazo)

- [ ] ____
- [ ] ____

## 10. Baseline de adoção (capturar no Mês 1)

| Métrica | Valor inicial | Data | Fonte |
|---|---|---|---|
| Nº de usuários ativos no Data Lake | ____ | | |
| Volume de queries / semana | ____ | | |
| Nº de tickets/dúvidas de dados | ____ | | |
| Tabelas documentadas | 0 | | |

## 11. Glossário do projeto (termos internos)

| Termo | Definição |
|---|---|
| Owner de domínio | Responsável por validar e manter os ativos de um domínio de dados |
| Trilho paralelo | Trabalho que avança sem depender do cliente |

## 12. Histórico de sessões (delta curto, mais recente no topo)

- AAAA-MM-DD — resumo de 1-3 linhas do que foi decidido/avançado.
