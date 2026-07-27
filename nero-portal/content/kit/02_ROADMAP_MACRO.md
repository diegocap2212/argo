# 02 — ROADMAP MACRO (24 semanas)

Acompanhamento semanal. Âncora no kickoff (Semana 1 = AAAA-MM-DD). Checkpoints quinzenais (Q1..Q12) geram o Report Quinzenal.

Convenção: 🔵 entrega | 🔗 dependência do cliente LM | ⚠️ risco | ✅ checkpoint/report.

---

## Visão geral por fase

| Fase | Semanas | Foco | Entrega-âncora |
|---|---|---|---|
| 0 — Mobilização & Discovery | 1–2 | Stack, acessos, baseline, priorização, RACI | Documento de Discovery + premissas confirmadas |
| 1 — Base de Conhecimento | 3–6 | Portal + guias + FAQ + estrutura de docs | Portal central no ar |
| 2 — Governança & Metadados | 7–10 | Catálogo, dicionário, glossário, ownership, lineage inicial | v1 catálogo + dicionário |
| 3 — Boas Práticas & Performance | 11–14 | Guias SQL/otimização, biblioteca de queries, templates | Guia + biblioteca v1 |
| 4 — Capacitação & Aculturamento | 15–18 | Plano, trilha, material, 1ª rodada de workshops | 1ª rodada concluída |
| 5 — Adoção & Evolução | 19–22 | Casos de uso por área, evolução de catálogo/queries | Relatório intermediário de adoção |
| 6 — Consolidação & Sustentação | 23–24 | Versões finais, operating model, handover | Handover + roadmap de maturidade |

> Contínuo durante todo o projeto: apoio consultivo às áreas, capacitação, evolução da documentação, monitoramento de adoção, e operação do agente + memória + report quinzenal.

---

## Detalhe semanal

### Fase 0 — Mobilização & Discovery (Semanas 1–2)
- **S1:** Kickoff. 🔗 Pedir acessos ao Data Lake. Confirmar stack/engine/formato (⚠️ P0 — bloqueia Fase 3). Definir RACI e sponsor. Capturar baseline de adoção (usuários ativos, volume de queries, tickets).
- **S2:** 🔗 Receber lista priorizada de tabelas (ou definir critério se LM atrasar). Mapear domínios candidatos e owners. Escolher portal. 🔵 Documento de Discovery + premissas confirmadas no 01_MEMORIA.
- ✅ **Q1 (fim S2):** Report quinzenal #1.

### Fase 1 — Base de Conhecimento (Semanas 3–6)
- **S3:** Estrutura padronizada de documentação (template, taxonomia). Setup do portal.
- **S4:** Guia de acesso ao Data Lake (depende de D1; ⚠️ se acesso não saiu, escrever com placeholders).
- **S5:** Guia de navegação/utilização do ambiente. FAQ inicial (semente).
- **S6:** 🔵 Portal central no ar com guias + FAQ + estrutura.
- ✅ **Q2 (fim S6):** Report quinzenal #2.

### Fase 2 — Governança & Metadados (Semanas 7–10)
- **S7:** v1 do catálogo (inventário das tabelas priorizadas).
- **S8:** v1 do dicionário (campos, tipos, regras). Iniciar glossário de negócio (recomendado).
- **S9:** Descrição funcional dos campos principais; mapeamento inicial de relacionamentos/lineage.
- **S10:** 🔵 Ownership dos domínios definido + catálogo/dicionário v1 validados. 🔗 (depende de SMEs do LM).
- ✅ **Q3 (fim S8) e Q4 (fim S10):** Reports #3 e #4.

### Fase 3 — Boas Práticas & Performance (Semanas 11–14)
> ⚠️ Só executável com stack confirmado (Fase 0).
- **S11:** Guia de boas práticas de SQL (no dialeto real).
- **S12:** Guia de otimização (filtros, partições, joins) específico do engine.
- **S13:** Biblioteca inicial de queries modelo.
- **S14:** 🔵 Templates reutilizáveis para análises recorrentes.
- ✅ **Q5/Q6:** Reports #5 e #6.

### Fase 4 — Capacitação & Aculturamento (Semanas 15–18)
- **S15:** Plano de aculturamento + trilha estruturada (por persona de área).
- **S16:** Material de treinamento. Calendário de workshops.
- **S17:** 1ª rodada de workshops.
- **S18:** 🔵 1ª rodada concluída + coleta de feedback.
- ✅ **Q7/Q8:** Reports #7 e #8.

### Fase 5 — Adoção & Evolução (Semanas 19–22)
- **S19:** Biblioteca de casos de uso por área de negócio.
- **S20:** Consolidação de dúvidas frequentes; evolução do catálogo/dicionário.
- **S21:** Evolução da biblioteca de queries.
- **S22:** 🔵 Relatório intermediário de adoção (vs baseline da S1).
- ✅ **Q9/Q10:** Reports #9 e #10.

### Fase 6 — Consolidação & Sustentação (Semanas 23–24)
- **S23:** Versões finais (portal, catálogo, dicionário). Indicadores de adoção consolidados. Operating model / plano de sustentação.
- **S24:** 🔵 Relatório executivo consolidado + roadmap de maturidade (incluindo lacunas nomeadas: Data Quality, Master/Reference Data, Segurança) + handover para equipe interna.
- ✅ **Q11/Q12:** Reports #11 e #12 (final).

---

## Marcos críticos & gates

| Gate | Quando | Critério para avançar |
|---|---|---|
| G0 — Stack confirmado | fim S1 | Plataforma/engine/formato documentados |
| G1 — Portal no ar | fim S6 | Usuário acessa guias e FAQ |
| G2 — Metadados v1 | fim S10 | Catálogo+dicionário+ownership validados pelo LM |
| G3 — Performance | fim S14 | Guias no dialeto real + biblioteca |
| G4 — 1ª capacitação | fim S18 | Workshop realizado com feedback |
| G5 — Adoção provada | fim S22 | Métricas vs baseline |
| G6 — Sustentação | fim S24 | Handover aceito pelo LM |

## Riscos de roadmap (sempre visíveis)
- ⚠️ Fricção LM pode estourar S1–S2 e S7–S10 (acessos, SMEs, ownership). → Trilhos paralelos + escalonamento quinzenal.
- ⚠️ Stack tardio atrasa toda a Fase 3. → Gate G0 é inegociável.
- ⚠️ Documentação sem ownership → operating model na Fase 6, não opcional.
