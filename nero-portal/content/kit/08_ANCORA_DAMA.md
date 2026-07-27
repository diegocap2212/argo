# 08 — ÂNCORA DE METODOLOGIA (DAMA-DMBOK2)

Referência curta para o Nero fundamentar decisões de forma consistente. Não é o livro —
é o esqueleto + como este projeto se encaixa nele. Mantém enxuto de propósito.

---

## 1. As 11 áreas de conhecimento (a "Roda DAMA")
Data Governance fica no centro e orquestra as outras dez.

| Área | Em uma linha |
|---|---|
| Data Governance (centro) | Autoridade, papéis, políticas e decisão sobre dados |
| Data Architecture | Estrutura geral, fluxos e blueprint dos dados |
| Data Modeling & Design | Como os dados são modelados (conceitual/lógico/físico) |
| Data Storage & Operations | Armazenamento, performance, operação do ambiente |
| Data Security | Acesso, classificação, proteção e privacidade |
| Data Integration & Interoperability | Movimentação e integração entre sistemas (ETL/ELT) |
| Document & Content Management | Conteúdo e documentos não estruturados, portal |
| Reference & Master Data | Dados-mestre e de referência (produto, cliente, loja) |
| Data Warehousing & BI | Entrega de dados para análise e decisão |
| Metadata | Dados sobre os dados: catálogo, dicionário, lineage |
| Data Quality | Confiabilidade: completude, acurácia, consistência |

## 2. Como ESTE projeto mapeia (foco e prioridade)

| Frente do projeto | Área(s) DAMA |
|---|---|
| Portal, FAQ, estrutura de docs | Document & Content Mgmt; Metadata |
| Catálogo, dicionário, lineage, ownership | Metadata + Data Governance |
| Glossário de negócio (recomendado) | Data Governance |
| Boas práticas SQL, partições, joins | Data Storage & Ops; Data Architecture |
| Trilha, workshops, aculturamento | Data Literacy (sob Governance) |
| Adoção, sustentação, operating model | Data Governance |

## 3. Três artefatos que NÃO se confundem
- **Catálogo** = inventário de ativos (tabela, dono, local, sensibilidade).
- **Dicionário** = nível de campo (tipo, regra, domínio de valores).
- **Glossário de negócio** = termos/métricas ("cliente ativo", "receita líquida").

## 4. Lacunas conscientes (entram no roadmap de maturidade — Fase 6, não no MVP)
- **Data Quality:** sem entregável formal hoje. Sem confiança no dado, autonomia não acontece.
- **Reference & Master Data:** dados-mestre (produto/cliente/loja) costumam virar dor — mapear na evolução.
- **Data Security:** hoje só "guia de acesso"; vira processo governado na sustentação.

## 5. Modelo de maturidade (para o roadmap da Fase 6)
Escala de 5 níveis (estilo CMMI/DMM) para posicionar o LM e definir o "para onde vamos":
1. **Inicial** — ad hoc, conhecimento na cabeça das pessoas.
2. **Gerenciado** — alguns padrões, documentação pontual.
3. **Definido** — processos e papéis de governança estabelecidos.
4. **Medido** — indicadores de qualidade e adoção acompanhados.
5. **Otimizado** — melhoria contínua, cultura data-driven madura.

> O projeto busca levar o LM do nível 1–2 para um 3 sustentável em 6 meses, deixando o caminho para 4–5 desenhado.

## 6. Como o Nero usa esta âncora
Ao analisar qualquer tarefa: nomear a(s) área(s) DAMA envolvida(s), checar se uma disciplina adjacente está sendo ignorada (qualidade, ownership, glossário) e posicionar a ação no nível de maturidade-alvo.
