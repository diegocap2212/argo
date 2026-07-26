# 05 — ONBOARDING DO ANALISTA DE GOV + DISCOVERY (cliente LM)

Escopo exclusivo do projeto de Governança de Dados do LM. Não importar contexto de outros clientes.
Serve para (a) dar o melhor caminho de entrada ao Analista de GOV e (b) mapear o que já temos vs. lacunas reais.

---

## Parte A — Caminho de onboarding (primeiras 2–3 semanas)

### Semana 1 — Contexto e acessos
- Ler, nesta ordem: `00_INSTRUCOES_AGENTE.md` → `01_MEMORIA_PROJETO.md` → `02_ROADMAP_MACRO.md` → `03_EPICS_E_TASKS.md`. (O 01 é a fonte da verdade do estado atual.)
- Internalizar a regra de isolamento (§1.1 do 00): este projeto é apartado de qualquer outro cliente/ferramenta.
- Solicitar acessos ao Data Lake e ao portal (registrar como dependência LM se travar).
- Conhecer o stack (preencher seção 2 do 01_MEMORIA). Sem isso, Fase 3 não anda.
- Mapear stakeholders/RACI (seção 3 do 01): quem é sponsor, quem são os owners candidatos, quem é a eng. de plataforma.

### Semana 2 — Diagnóstico
- Capturar o baseline de adoção (seção 10 do 01) — sem isso não há como provar ROI no mês 6.
- Inventariar a documentação existente usando a matriz da Parte C → marcar Temos/Parcial/Lacuna.
- Rodar o questionário de discovery (Parte B) com as pessoas certas do LM.
- Priorizar domínios e tabelas com o cliente (ou propor critério se o LM atrasar).

### Semana 3 — Primeiras entregas
- Estrutura padronizada de documentação + esqueleto do portal.
- Primeiro rascunho de catálogo/dicionário das tabelas priorizadas (com placeholders onde faltar insumo do LM).
- Atualizar 01_MEMORIA e produzir o primeiro "📌 DELTA DE MEMÓRIA".

> Princípio anti-fricção: se o LM travar acesso/insumo, o onboarding não para — avança no que independe do cliente (estrutura, templates, critérios, rascunhos).

---

## Parte B — Questionário de discovery (insumos para o Analista de GOV)

### B1. Plataforma & técnica
- Qual é a plataforma do Data Lake? (Databricks / Synapse / BigQuery / Athena-Trino / Snowflake / outro)
- Qual engine/dialeto de SQL os usuários usam? Há mais de um?
- Formato de armazenamento? (Delta / Iceberg / Parquet / Hudi)
- Como os dados são particionados hoje? Há padrão?
- Existe camada/medalhão (bronze/silver/gold) ou zonas? Como estão organizadas?
- Há ferramenta de catálogo/governança já instalada? (Unity Catalog / Purview / Glue / outro)
- Qual ferramenta de BI/consumo as áreas usam?

### B2. Acesso & segurança
- Como se solicita e concede acesso ao Data Lake hoje? Quem aprova?
- Há classificação de sensibilidade/dados pessoais (LGPD)? Quem responde por isso?
- Existem restrições por área/perfil?

### B3. Domínios, ativos & ownership
- Quais são os domínios de dados (ex.: vendas, clientes, produtos, financeiro)?
- Quais tabelas/datasets são os mais usados pelas áreas hoje?
- Existe dono/responsável por dado hoje, mesmo informal? Quem?
- Há relacionamentos/lineage documentados em algum lugar?

### B4. Documentação existente
- Existe algum catálogo, dicionário ou glossário hoje? Onde? Atualizado?
- Existe padrão de nomenclatura de tabelas/campos?
- Onde a documentação vive hoje (wiki, drive, planilhas soltas)?

### B5. Negócio & cultura
- Quais são as métricas/termos de negócio que geram mais divergência? (insumo para o glossário)
- Quais perguntas de negócio as áreas mais tentam responder com dados?
- Qual o nível atual de autonomia das áreas (dependem de um time central para tudo)?

### B6. Adoção (baseline)
- Dá para extrair logs de query / nº de usuários ativos / volume de consultas? Como?
- Existe registro de dúvidas/tickets de dados hoje?

### B7. Stakeholders & fricção
- Quem é o sponsor e qual o poder de decisão dele?
- Quais decisões historicamente travam no LM? Por quê?
- Quem são os SMEs por domínio e qual a disponibilidade deles?
- Qual o canal e o SLA realista para destravar pedidos com o LM?

---

## Parte C — Matriz de inventário × lacuna (o que temos vs. onde está o buraco)

Marque cada item: ✅ Temos | 🟡 Parcial | 🔴 Lacuna. Atualize conforme as docs do LM chegarem.

| # | Documento / ativo esperado | Área DAMA | Status | Onde está / observação |
|---|---|---|---|---|
| 1 | Documentação do stack/arquitetura do Data Lake | Data Architecture | 🔴 | |
| 2 | Política/processo de acesso e segurança (LGPD) | Data Security | 🔴 | |
| 3 | Padrão de nomenclatura de tabelas/campos | Data Modeling | 🔴 | |
| 4 | Catálogo de dados existente | Metadata | 🔴 | |
| 5 | Dicionário de dados existente | Metadata | 🔴 | |
| 6 | Glossário de negócio | Data Governance | 🔴 | gap clássico — quase sempre ausente |
| 7 | Lineage / mapa de relacionamentos | Metadata | 🔴 | |
| 8 | Lista de tabelas/datasets mais usados | Metadata | 🔴 | |
| 9 | Definição de owners por domínio | Data Governance | 🔴 | |
| 10 | Logs/medição de uso (baseline de adoção) | Data Governance | 🔴 | |
| 11 | Guias de SQL / boas práticas existentes | Data Storage & Ops | 🔴 | |
| 12 | Material de treinamento anterior | Data Literacy | 🔴 | |
| 13 | Portal/wiki de conhecimento atual | Doc & Content Mgmt | 🔴 | |
| 14 | Mapa de stakeholders / RACI | Data Governance | 🔴 | |

> Leitura de especialista: itens 6 (glossário de negócio), 9 (ownership) e 10 (baseline) são os que mais costumam estar em lacuna e os que mais derrubam projetos de governança. Priorize fechá-los cedo. Os itens de Data Quality e Master/Reference Data não estão nesta matriz porque ainda não são entregáveis do projeto — devem entrar como lacunas conscientes no roadmap de maturidade (Fase 6).

---

### Como usar este documento com o agente
Ao receber docs do LM, peça ao agente para atualizar a matriz da Parte C e refletir as lacunas no `01_MEMORIA_PROJETO.md`. O agente deve apontar quais lacunas bloqueiam quais fases e propor o trilho paralelo para cada uma.
