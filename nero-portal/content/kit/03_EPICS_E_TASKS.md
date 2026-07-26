# 03 — EPICS & TASKS (hierarquia ágil genérica)

Hierarquia: **Epic → Feature → História → Task** (independente de ferramenta).
Ferramenta de gestão do projeto LM: **a definir** com a equipe/cliente — não amarrar a nenhuma plataforma de outro contrato.
Campos sugeridos por item: Área DAMA, Fase, Depende de LM? (S/N), Trilho paralelo.

---

## E0 — Mobilização & Discovery (Fase 0)
Objetivo: destravar pré-requisitos antes de qualquer entrega.

- **F0.1 Confirmação de stack & ambiente** — US: Como equipe, quero o stack do Data Lake documentado para escrever boas práticas válidas. ✔ Critério: plataforma, engine/dialeto, formato e particionamento registrados no 01_MEMORIA.
- **F0.2 Acessos & segurança** — US: Como equipe, quero acesso de leitura ao Data Lake. Depende de LM: S · Trilho paralelo: estruturar guias com placeholders.
- **F0.3 Baseline de adoção** — US: Como projeto, quero medir uso atual para provar evolução depois. ✔ Critério: usuários ativos, volume de queries e tickets registrados.
- **F0.4 Priorização de ativos & RACI** — US: Como equipe, quero a lista priorizada de tabelas e os owners candidatos. Depende de LM: S · Trilho: definir critério de priorização.

## E1 — Base de Conhecimento (Fase 1)
- **F1.1 Estrutura padronizada de documentação** — US: template + taxonomia aprovados.
- **F1.2 Portal central** — US: portal (SharePoint/Confluence) publicado e acessível.
- **F1.3 Guia de acesso ao Data Lake** — Depende de LM: S.
- **F1.4 Guia de navegação/utilização** — US: passo a passo do ambiente.
- **F1.5 FAQ inicial** — US: ≥ 15 perguntas-semente respondidas.
- ✔ **Aceite do Epic:** usuário consegue, pelo portal, achar como acessar e navegar.

## E2 — Governança & Metadados (Fase 2)
- **F2.1 Catálogo de dados v1** — US: tabelas priorizadas inventariadas (nome, local, dono, descrição, sensibilidade).
- **F2.2 Dicionário de dados v1** — US: campos das tabelas priorizadas (tipo, regra, domínio, nulabilidade).
- **F2.3 Glossário de negócio (recomendado)** — US: termos/métricas-chave definidos e aprovados.
- **F2.4 Lineage / relacionamentos iniciais** — US: mapa de relacionamentos das tabelas core.
- **F2.5 Ownership & operating model embrionário** — US: dono por domínio definido e aceito. Depende de LM: S.
- ✔ **Aceite:** catálogo+dicionário validados por ao menos 1 owner por domínio.

## E3 — Boas Práticas & Performance (Fase 3) — *bloqueado por E0.1*
- **F3.1 Guia de boas práticas de SQL** (no dialeto real).
- **F3.2 Guia de otimização** — filtros, partições, joins, custo de consulta.
- **F3.3 Biblioteca de queries modelo** — versionada no portal/repo.
- **F3.4 Templates de análises recorrentes.**
- ✔ **Aceite:** usuário roda uma análise recorrente a partir de um template.

## E4 — Capacitação & Aculturamento (Fase 4)
- **F4.1 Plano de aculturamento** (por persona de área).
- **F4.2 Trilha estruturada** (níveis: iniciante → autônomo).
- **F4.3 Material de treinamento** (slides, exercícios).
- **F4.4 Calendário de workshops.**
- **F4.5 1ª rodada de workshops** — ✔ Aceite: ≥ 1 turma por área prioritária + feedback coletado.

## E5 — Adoção & Evolução (Fase 5)
- **F5.1 Biblioteca de casos de uso por área.**
- **F5.2 Consolidação de FAQ recorrente.**
- **F5.3 Evolução de catálogo/dicionário** (novas tabelas/regras).
- **F5.4 Evolução da biblioteca de queries.**
- **F5.5 Relatório intermediário de adoção** — ✔ Aceite: métricas comparadas ao baseline.

## E6 — Consolidação & Sustentação (Fase 6)
- **F6.1 Versões finais** (portal, catálogo, dicionário).
- **F6.2 Relatório executivo consolidado + indicadores.**
- **F6.3 Plano de sustentação pós-projeto** (operating model + papéis de stewardship).
- **F6.4 Roadmap de maturidade** — incluir lacunas nomeadas: Data Quality, Master/Reference Data, Data Security.
- **F6.5 Handover para equipe interna** — ✔ Aceite: equipe LM assume manutenção documentada.

## E7 — Operação do Agente de IA & Memória (transversal)
- **F7.1 Setup do Projeto Claude** (instruções + kit no conhecimento).
- **F7.2 Ritual de memória** — 01_MEMORIA atualizado ao fim de cada sessão.
- **F7.3 Disciplina de tokens** — conhecimento enxuto, docs pesados sob demanda.
- ✔ **Aceite:** qualquer membro retoma o contexto lendo só o 01_MEMORIA.

## E8 — Gestão, Report & Dependências do Cliente (transversal/contínuo)
- **F8.1 Report quinzenal** — 12 reports (Q1–Q12) a partir do template.
- **F8.2 Registro de dependências LM** — atualizado toda sessão, aging visível.
- **F8.3 Escalonamento** — escada: Dia 0 pedir à Priscila + trilho paralelo; Dia 1 cobrar + workaround; Dia 2+ vermelho no report e escalar acima da Priscila.
- **F8.4 Apoio consultivo contínuo** — orientação, apoio a consultas, interpretação de dados.
- ✔ **Aceite:** nenhum report fecha com entrega "parada por LM" sem trilho paralelo registrado.

---

### Dica de organização
Crie primeiro os Epics E0–E8; depois as Features (F*.*); depois as Histórias e Tasks. Em cada item, preencha os campos sugeridos (Área DAMA, Fase, Depende de LM?, Trilho paralelo) para manter rastreabilidade e leitura executiva. A escolha da ferramenta (Jira, Trello, planilha, ou a que o LM já usar) fica para alinhamento com o cliente.
