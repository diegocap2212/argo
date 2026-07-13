# Modelo de Maturidade Ágil — Contexto LM Mobilidade
## Conteúdo completo v1 — 10 dimensões × 4 estágios

---

## A escala

Quatro estágios, numerados 1–4, com cálculo decimal preservado (um time pode estar em 2.4 — o avanço aparece mesmo dentro do mesmo estágio). Cada estágio tem nome duplo: a nomenclatura de maturidade original entre parênteses, e a lente Tuckman como narrativa complementar.

**Estágio 1 — Formação e Alinhamento Inicial** (Formativo/Reativo · Forming)
O propósito do time é pouco claro ou conhecido apenas por parte das pessoas. Há dependência da liderança para direcionamento, incerteza sobre papéis e prioridades definidas por influência, urgência ou hierarquia. O time ainda está se conhecendo, construindo confiança e formando uma identidade comum.

**Estágio 2 — Confronto e Estruturação** (Visível · Storming)
O propósito já está documentado e conhecido, mas sua aplicação ainda é inconsistente. Surgem conflitos sobre prioridades, responsabilidades e formas de trabalho. O time começa a utilizar o propósito como critério de decisão, porém ainda há divergências e disputas sobre o que deve ser priorizado. O atrito deste estágio é esperado e saudável — é o preço da estruturação.

**Estágio 3 — Normalização e Direcionamento** (Definido · Norming)
O time compartilha uma compreensão clara do propósito e passa a utilizá-lo de forma consistente para definir escopo e prioridades. As regras de trabalho são aceitas, a confiança aumenta e a colaboração se fortalece. Demandas desalinhadas passam a ser questionadas de forma legítima e construtiva.

**Estágio 4 — Performance e Autonomia** (Gerenciado · Performing)
O time atua com autonomia e alta colaboração, utilizando dados, contexto de negócio e propósito para orientar decisões. Conflitos são resolvidos internamente, iniciativas são propostas pelo próprio time e stakeholders confiam em sua capacidade de gerar resultados e direcionar o trabalho. A autonomia de processo — operar o método sem intervenção constante — é a marca transversal deste estágio.

---

## Os três eixos

| Eixo | Dono | Dimensões |
|---|---|---|
| **Processo** | Scrum Master | 1. Cadência & Sprint · 2. Higiene do Backlog & DoR · 3. Qualidade da Entrega (DoD) · 4. Métricas & Indicadores · 5. Previsibilidade & Fluxo |
| **Produto** | Product Owner | 6. Visão de Produto & Roadmap · 7. Validação de Épicos · 8. Escrita & Fatiamento de Histórias · 9. Comunicação de Valor |
| **Time** | Todos | 10. Cultura, Conhecimento & Melhoria |

Leitura executiva por eixo: "Processo 3.1 · Produto 2.2 · Time 2.8". O SM responde pela maturidade de processo; o PO pela maturidade de produto. São réguas separadas com donos separados.

---

## Perspectivas e governança da nota

O assessment acontece em **um workshop único** (60–90 min) com time, PO, TL e SM juntos, seguido de homologação assíncrona pelo AM.

**Dinâmica do workshop, por dimensão:**
1. **Votação silenciosa** — todos leem as descrições e registram seu estágio na ferramenta antes de qualquer fala (time, PO, TL e SM votam individualmente). Evita o efeito âncora de quem fala primeiro.
2. **Revelação simultânea** — convergiu, a nota fecha; divergência ≥ 2 estágios abre discussão curta, cada lado explicando o que observou.
3. **Âncoras de dados na tela** — durante a discussão, a ferramenta exibe o estado das âncoras da dimensão (sustentam / conflitam / não se aplicam), como insumo da conversa.
4. **Nota proposta** — consenso da sala; persistindo o empate, o SM tem a palavra final como especialista no método.

**Homologação:** o pacote completo — notas propostas, votos individuais por perspectiva, divergências registradas e estado das âncoras — segue para o **AM**, que homologa de forma assíncrona. Ajustes do AM são registrados com justificativa. Só após homologação a nota vira **oficial** (conceito já existente na ferramenta).

**Por que os votos individuais continuam sendo registrados:** mesmo com nota única por consenso, o histórico de divergência por perspectiva é o sinal diagnóstico mais rico do modelo — mostra onde time e liderança enxergam realidades diferentes, e alimenta a análise de evolução entre assessments.

**Calibração cruzada:** os AMs homologam todos os squads com a mesma régua, o que habilita rodadas trimestrais de calibração entre AMs — garantindo que o estágio 2.5 de um squad signifique o mesmo que o 2.5 de outro. É o que torna o radar comparativo da torre um instrumento de gestão, e não uma pilha de opiniões.

---
---

# EIXO PROCESSO

---

## Dimensão 1 — Cadência & Sprint

**Descrição:** Adesão ao Scrum com sprint de 1 semana (segunda a sexta), disciplina de abertura e fechamento, board do Jira fiel à realidade e fluxos padronizados respeitados. GMUDs acontecem fora da sprint e não competem com as entregas planejadas.

**Narrativa:** Sexta-feira, 17h. A sprint deveria fechar, mas ninguém sabe o que foi entregue — metade dos cards está em colunas que não refletem a realidade e a planning de segunda vai começar sem que a sprint anterior tenha sido encerrada. O ciclo existe no calendário, mas não existe na prática.

### Estágio 1 — Formação e Alinhamento Inicial
A cadência é irregular ou meramente formal. Sprints abrem e fecham sem cerimônia real; às vezes a sprint anterior nem é encerrada no Jira. Cerimônias são tratadas como obrigação sem valor percebido — pessoas chegam atrasadas ou fazem multitask. GMUDs e urgências invadem a sprint sem negociação. O fluxo do Jira é alterado localmente conforme conveniência.
- **Exemplo real:** cerimônias tratadas como obrigação, sem valor percebido — gap mapeado na torre.
- **Kaizen:** estabelecer o ritual mínimo inegociável: sprint abre segunda com planning e fecha sexta com review/retro, mesmo que curtas. Duas semanas de consistência antes de melhorar o conteúdo.
- **Âncora de dados:** % de sprints abertas/fechadas na data; nº de cards movidos retroativamente após o fim da sprint.

### Estágio 2 — Confronto e Estruturação
A cadência semanal acontece com regularidade, mas gera atrito: o time disputa o valor das cerimônias ("daily é perda de tempo"), há resistência ao fluxo travado do Jira e negociações tensas quando GMUDs pressionam a sprint. As cerimônias existem, mas ainda são eventos isolados — a retro não alimenta a planning, a daily não alimenta a retro.
- **Exemplo:** a daily acontece todo dia às 9h, mas virou status report — cada um fala o que fez, ninguém escuta, todos saem aliviados quando acaba.
- **Kaizen:** mudar o foco da daily de "o que fiz" para "o que está travado e quem pode ajudar". Uma pergunta só, 15 minutos, e registrar os bloqueios levantados.
- **Âncora de dados:** GMUDs executadas dentro vs. fora da sprint; % de presença nas cerimônias.

### Estágio 3 — Normalização e Direcionamento
O ritmo semanal é previsível e protegido pelo próprio time. Cerimônias estão conectadas: ações da retro viram itens do backlog, bloqueios da daily alimentam a retro, a planning considera capacidade real baseada em histórico. GMUD fora da sprint é regra respeitada e defendida pelo time, não imposição do SM. O board é a fonte da verdade.
- **Exemplo:** um stakeholder tenta encaixar uma GMUD na quarta-feira; o time aponta a janela oficial e o pedido é reagendado sem escalação.
- **Kaizen:** revisar a efetividade de cada ritual trimestralmente — o tempo investido gera valor proporcional? Ajustar duração e formato com base na resposta.
- **Âncora de dados:** % de itens não planejados entrando na sprint; estabilidade do escopo entre abertura e fechamento.

### Estágio 4 — Performance e Autonomia
A cadência é otimizada para o contexto do squad, com base em dados. O time questiona e ajusta formato e frequência das cerimônias — e elimina sem culpa o que não gera valor. A sprint semanal funciona como instrumento deliberado de redução de incerteza: validação e feedback a cada ciclo. O squad opera o método sem intervenção do Agile Master.
- **Exemplo:** o time percebe pelo histórico que reviews quinzenais com stakeholders geram mais presença e decisão que semanais — propõe o ajuste com dados e a AM apenas homologa.
- **Kaizen:** documentar o funcionamento da cadência do squad como referência e apadrinhar um squad em estruturação na implantação do ritmo semanal.
- **Âncora de dados:** aderência planejado vs. realizado sustentada; zero GMUDs dentro de sprint em 12 semanas.

---

## Dimensão 2 — Higiene do Backlog & DoR

**Descrição:** Organização e refinamento contínuo do backlog e aplicação da Definition of Ready — nenhum item entra na sprint sem cumprir os 6 critérios: problema e valor claros, critérios de aceite testáveis, escopo dimensionado para a sprint, dependências mapeadas, esforço estimado pelo time e requisitos de UX disponíveis quando aplicável.

**Narrativa:** Terça-feira, segundo dia da sprint. O dev abre a história e percebe que não sabe o que ela pede. Chama o PO, que também não lembra — a demanda veio "de cima". Descobrem no meio do caminho que depende de uma API de outro time, que ninguém avisou. O item vai atravessar três sprints, não porque era grande, mas porque nasceu pela metade.

### Estágio 1 — Formação e Alinhamento Inicial
O backlog é desorganizado: mistura ideias, demandas mortas e itens ativos sem distinção. Histórias entram na sprint sem critérios de aceite, sem estimativa e com dependências desconhecidas. O refinamento não existe ou acontece dentro da própria sprint, roubando capacidade. Não há DoR — ou ela existe num documento que ninguém consulta.
- **Exemplo real:** backlog desorganizado, user stories mal escritas e histórias grandes demais para uma sprint — dores mapeadas na trilha de POs da torre.
- **Kaizen:** listar os últimos 5 itens que travaram ou voltaram durante a sprint e identificar o que faltava quando entraram. Esse padrão é a primeira versão da DoR do time.
- **Âncora de dados:** % de itens bloqueados na primeira metade da sprint; itens sem estimativa ao entrar na sprint.

### Estágio 2 — Confronto e Estruturação
A DoR existe, está escrita e é conhecida — mas é disputada. O PO pressiona para entrar item incompleto ("é urgente, refina depois"), o time resiste, e as exceções "só dessa vez" são frequentes. O refinamento acontece, mas de forma irregular. O conflito sobre o que pode ou não entrar na sprint é constante — e é o sinal de que o acordo está sendo levado a sério pela primeira vez.
- **Exemplo:** na planning, o time recusa uma história sem critérios de aceite; o PO escala para a gestão; a discussão que se segue termina consolidando a DoR como acordo oficial do squad.
- **Kaizen:** registrar cada exceção à DoR — o que foi pulado e por quê. Revisar mensalmente: se a mesma exceção se repete, ou o critério se ajusta ou a causa raiz se resolve.
- **Âncora de dados:** % de itens da sprint cumprindo os 6 critérios na entrada; nº de exceções registradas por sprint.

### Estágio 3 — Normalização e Direcionamento
A DoR é respeitada consistentemente — exceções são raras, decididas explicitamente e com registro do risco assumido. O refinamento é cadência contínua, não evento. Itens chegam à planning prontos: valor claro, aceite testável, dependências com plano de ação. Trabalho raramente trava por ambiguidade.
- **Exemplo:** um item com dependência de acesso a ambiente só entra na sprint depois que o acesso está confirmado — a dependência foi identificada no refinamento, duas semanas antes.
- **Kaizen:** medir o efeito da DoR: comparar lead time e taxa de retorno de itens que cumpriram os 6 critérios vs. exceções. Usar o dado para calibrar os critérios.
- **Âncora de dados:** ≥ 90% dos itens da sprint atendendo à DoR completa; taxa de bloqueio por dependência não mapeada próxima de zero.

### Estágio 4 — Performance e Autonomia
100% dos itens da sprint atendem à DoR — e o time evolui os critérios com base em dados ("desde que adicionamos o critério X, retrabalho caiu Y%"). O backlog é enxuto e vivo: itens mortos são removidos sem cerimônia, e o refinamento antecipa a sprint em pelo menos um ciclo. Stakeholders entendem e respeitam a porta de entrada.
- **Exemplo:** um diretor pede um item para "entrar hoje"; o PO mostra o funil de refinamento e negocia a entrada para a próxima sprint com o item devidamente preparado — e o diretor aceita, porque o histórico de entrega sustenta a regra.
- **Kaizen:** transformar a DoR do squad em template comentado para a torre, com os aprendizados de calibragem documentados.
- **Âncora de dados:** 100% de aderência à DoR por 3 quinzenas; refinamento cobrindo ≥ 1 sprint à frente.

---

## Dimensão 3 — Qualidade da Entrega (DoD)

**Descrição:** Aplicação da Definition of Done nas 3 fases: construção e qualidade técnica (code review, testes unitários, integração), validação funcional (aceite testado, QA sem bugs críticos, regressão quando aplicável) e finalização (documentação atualizada, incremento aceito pelo PO).

**Narrativa:** O dev diz: "terminei". O QA pergunta: "cadê os testes?". O dev: "não sabia que precisava". O PO: "mas não está em produção ainda". Três pessoas, três definições de "pronto". A história volta para o backlog — pela segunda vez.

### Estágio 1 — Formação e Alinhamento Inicial
"Pronto" significa coisas diferentes para cada pessoa. Código sobe sem review, testes são opcionais e dependem do dev, e o aceite do PO é informal ou inexistente. Retrabalho é frequente e bugs em produção são descobertos pelo usuário. Não há DoD escrita — ou há uma genérica que ninguém segue.
- **Exemplo:** um item marcado como DONE volta três dias depois porque nunca passou por QA — e ninguém consegue dizer se deveria ter passado.
- **Kaizen:** listar os últimos 5 itens que geraram retrabalho ou bug em produção e identificar o que faltou checar. Esse padrão é a primeira versão da DoD.
- **Âncora de dados:** taxa de retorno de itens após DONE; bugs em produção por sprint.

### Estágio 2 — Confronto e Estruturação
A DoD existe nas 3 fases, mas sua aplicação gera tensão: code review é visto como gargalo, testes "atrasam a entrega" e o aceite do PO trava no fim da sprint. Exceções sob pressão de prazo ainda acontecem — e cada uma delas reabre a discussão sobre o que é inegociável.
- **Exemplo:** para fechar a sprint, o time pula a regressão "só dessa vez" — e o bug que escapa consome metade da sprint seguinte. A retro transforma o episódio em acordo: regressão não se pula.
- **Kaizen:** registrar cada exceção à DoD com o risco assumido e o resultado real. Um mês de registros mostra o custo verdadeiro dos atalhos.
- **Âncora de dados:** % de itens passando pelas 3 fases completas; retrabalho originado de exceções.

### Estágio 3 — Normalização e Direcionamento
As 3 fases são rotina: nenhum código integra sem review, critérios de aceite são testados antes do aceite, e o PO valida dentro da sprint, não depois. Exceções são raras (menos de 1 em 10 itens) e sempre explícitas. A qualidade deixou de depender de heroísmo individual — é propriedade do processo.
- **Exemplo:** o aceite do PO acontece na quinta-feira, com calma, porque os itens chegam validados de QA desde quarta — o fim da sprint deixou de ser corrida.
- **Kaizen:** adicionar critérios de entrada por etapa (o que precisa existir antes de um item entrar em QA, por exemplo) — prevenir em vez de detectar.
- **Âncora de dados:** ≤ 10% de itens com exceção; bugs críticos em homologação tendendo a zero.

### Estágio 4 — Performance e Autonomia
A DoD evolui com dados: o time mede o impacto de cada critério ("desde que adicionamos X, bugs em prod caíram Y%") e ajusta o padrão continuamente. Automação cobre o que é repetitivo (testes, integração), liberando o review humano para o que exige julgamento. O aceite do PO é formalidade rápida porque a qualidade foi construída ao longo do fluxo.
- **Exemplo:** o time apresenta na review trimestral a série histórica: taxa de retorno caiu de 18% para 3% desde a implantação da DoD em 3 fases — e mostra qual critério respondeu por cada queda.
- **Kaizen:** compartilhar o playbook de qualidade com a torre e apadrinhar a implantação da DoD em um squad em estruturação.
- **Âncora de dados:** taxa de retorno < 5% sustentada por 12 semanas; zero bugs críticos em produção no trimestre.

---

## Dimensão 4 — Métricas & Indicadores

**Descrição:** Existência, atualização diária e confiabilidade das 4 métricas core (Vazão, Cycle Time, Lead Time P85, Cone da Incerteza) no painel de métricas do time, e o quanto o time — não só o SM — trata dados como artefato inegociável da operação. Na LM, ser data-driven não é aspiração: é requisito de base.

**Narrativa:** É véspera da reunião mensal com a liderança. O SM abre o painel e encontra três semanas de buraco. Passa a tarde reconstituindo números de memória, cruzando com um board que também não reflete a realidade. Os indicadores até chegam na reunião — mas todo mundo na sala sabe que são arqueologia, não gestão.

### Estágio 1 — Formação e Alinhamento Inicial
As métricas não existem ou não são confiáveis. O painel é preenchido em rajadas, antes de cobranças. Cards no Jira não refletem a realidade — status desatualizado, "cards fantasmas", itens concluídos que nunca transitaram para DONE. Quando a atualização acontece, é centralizada no SM ou na AM, sem participação do time. Prazo é chute educado.
- **Exemplo real:** o gap transversal dos 4 SMs da torre — indicadores desatualizados por falta de rotina, treinamento ou centralização indevida.
- **Kaizen:** implantar a rotina diária do SM: 5 minutos após a daily conferindo se o board reflete a realidade e se nenhum card está parado sem motivo há mais de 2 dias. Só observar e registrar — a cobrança vem depois.
- **Âncora de dados:** % de cards DONE sem data de resolução; dias desde a última atualização do painel.

### Estágio 2 — Confronto e Estruturação
As 4 métricas existem e são atualizadas com regularidade, mas geram atrito — e isso é esperado, não é falha. Os números começam a expor problemas (vazão caindo, cycle time inflando) e o time disputa a interpretação: "foi culpa das GMUDs", "esse número não representa nosso trabalho". A atualização ainda depende de cobrança do SM; o time atualiza os cards, mas não se sente dono dos dados.
- **Exemplo:** a vazão cai duas semanas seguidas e a daily vira tribunal de justificativas em vez de investigação de causa.
- **Kaizen:** levar uma métrica por semana para a retro com uma única pergunta padrão — "o que esse número nos diz sobre o nosso sistema?" — proibindo nomes de pessoas na resposta. Repetir até o desconforto virar curiosidade.
- **Âncora de dados:** painel com defasagem ≤ 1 dia; 100% dos cards parados > 2 dias sinalizados na daily.

### Estágio 3 — Normalização e Direcionamento
Atualizar dados virou hábito do time, não tarefa do SM. As métricas entram nas decisões: a planning considera a vazão histórica antes de aceitar escopo; item parado ganha dono e prazo no mesmo dia; respostas de prazo usam faixas baseadas em lead time real ("itens assim levam de 4 a 7 dias"), não sensação. Demandas acima da capacidade são recusadas com o dado na mesa.
- **Exemplo:** na planning, o time recusa dois itens extras mostrando que a vazão média das últimas 6 sprints é 8 itens — e o stakeholder aceita, porque o número tem histórico.
- **Kaizen:** evoluir da média para percentis — comunicar P85 ("85% dos itens saem em até X dias") e registrar previsão vs. realizado por 4 sprints para calibrar.
- **Âncora de dados:** aderência comprometido vs. entregue ≥ 70% por 3 quinzenas consecutivas; cycle time com variação estável.

### Estágio 4 — Performance e Autonomia
Compromissos são ancorados em P85 e no Cone da Incerteza — o time responde "85% de chance até dia X, 50% até dia Y" e sustenta a resposta com dados auditáveis. Stakeholders consultam o painel diretamente, sem intermediação, porque confiam que ele é espelho fiel do board. O próprio time propõe ajustes de processo a partir de anomalias que detecta nos dados.
- **Exemplo:** perguntado sobre a data da release, o time abre o cone, mostra a faixa P15–P85 e negocia escopo sobre a projeção — a conversa muda de "promete pra quando?" para "o que cabe até lá?".
- **Kaizen:** apadrinhar outro squad da torre na implantação da rotina de métricas e publicar trimestralmente a retrospectiva de precisão ("previmos X, entregamos Y").
- **Âncora de dados:** P85 estável (±20%) por 12 semanas; cone da release dentro da meta; auditoria painel × board sem divergências.

---

## Dimensão 5 — Previsibilidade & Fluxo

**Descrição:** Comportamento do sistema de trabalho: quanto trabalho simultâneo o time carrega, com que rapidez detecta e destrava itens parados, e quão estável é o seu ritmo. É a dimensão que separa "temos métricas" (dimensão 4) de "nosso fluxo se comporta bem".

**Narrativa:** O time tem 5 pessoas e 17 itens "em progresso". Todo mundo começa tudo, ninguém termina nada. Quando o gestor pergunta "quando vai ficar pronto?", a resposta honesta seria: "quando alguém parar de me interromper com coisas novas".

### Estágio 1 — Formação e Alinhamento Inicial
Não há noção de limite de trabalho simultâneo. Cada pessoa carrega vários itens ao mesmo tempo; muito começa, pouco termina, tudo demora. Quando algo trava, simplesmente fica parado — não há urgência coletiva para manter movimento. O cycle time oscila sem padrão e ninguém sabe dizer por quê.
- **Exemplo:** 8 itens parados em "Code Review" há uma semana. Ninguém move, ninguém pergunta — "tecnicamente" estão em andamento.
- **Kaizen:** começar a daily com uma pergunta única: "tem algo parado?". Identificar já é o primeiro passo. Somar quantos itens cada pessoa carrega — o total costuma assustar, e esse susto é o ponto de partida.
- **Âncora de dados:** itens em andamento por pessoa; % de itens parados > 2 dias sem justificativa.

### Estágio 2 — Confronto e Estruturação
O time reconhece que trabalhar em tudo ao mesmo tempo é o problema — e começa a disputar o que fazer a respeito. Limites de trabalho simultâneo são experimentados e violados; dizer "não" ou "depois" para demandas urgentes gera conflito com stakeholders (e dentro do próprio time). Itens parados são identificados na daily, mas nem sempre ganham dono.
- **Exemplo:** o time combina máximo de 2 itens por pessoa; na primeira urgência, o acordo quebra — e a retro discute se o limite estava errado ou se faltou defendê-lo.
- **Kaizen:** quando algo parar, definir na hora: quem resolve? até quando? Acompanhar no dia seguinte. Transformar o destravamento em prioridade sobre começar coisa nova.
- **Âncora de dados:** aging dos itens em andamento; cycle time médio por tipo de item.

### Estágio 3 — Normalização e Direcionamento
Terminar antes de começar é norma aceita. Itens mais antigos têm prioridade; impedimentos ganham dono e prazo no mesmo dia; ninguém puxa trabalho novo enquanto há item desbloqueável esperando. O cycle time estabiliza — itens parecidos levam tempos parecidos — e o time percebe acúmulos se formando antes de virarem gargalo.
- **Exemplo:** na daily, a primeira pergunta é "o que pode terminar hoje?" — e o time redistribui esforço para fechar os dois itens mais antigos antes de abrir os novos.
- **Kaizen:** monitorar a vazão semanal para validar se o ritmo é sustentável e usar o histórico para calibrar quanto trabalho entra por sprint.
- **Âncora de dados:** cycle time estável (variação decrescente); idade máxima de item em andamento caindo.

### Estágio 4 — Performance e Autonomia
O ritmo é sustentável, previsível e defendido com dados. Trabalho só entra quando há capacidade real comprovada pelo histórico. O time detecta anomalias de fluxo antes de qualquer stakeholder perceber atraso, e ajusta seus próprios limites periodicamente com base em vazão. Compromissos externos são ancorados no P85 — e cumpridos.
- **Exemplo:** o time nota no painel que a coluna de homologação começou a acumular, investiga na mesma semana e descobre um ambiente instável — resolve antes de qualquer item estourar prazo.
- **Kaizen:** experimentar variações deliberadas de limite de trabalho simultâneo e medir o efeito na vazão — tratar o próprio processo como objeto de experimento.
- **Âncora de dados:** aderência de compromisso ≥ 85%; P85 do lead time estável por 12 semanas.

---
---

# EIXO PRODUTO

---

## Dimensão 6 — Visão de Produto & Roadmap

**Descrição:** Clareza de propósito do squad, existência de roadmap no padrão LM e priorização baseada em critérios e dados — não em influência, urgência ou hierarquia. Sem roadmap não há visão de produto; sem visão, a priorização vira reativa. Este é o marcador direto de maturidade do PO.

**Narrativa:** Na reunião de priorização, três pessoas defendem três direções diferentes. Uma quer acelerar uma integração, outra quer melhorar relatórios, outra quer corrigir bugs críticos. Sem clareza de propósito, cada sprint é uma batalha política — e o time nunca sabe se está ganhando ou perdendo.

### Estágio 1 — Formação e Alinhamento Inicial
O propósito do squad existe, no máximo, na cabeça de algumas pessoas. Não há roadmap — ou há um slide desatualizado que ninguém consulta. A priorização é reativa: decide quem pede mais alto, mais urgente ou de cargo mais alto. O PO atua como despachante de demandas, não como dono de produto.
- **Exemplo real:** POs sem roadmap e com priorização reativa — gap direto de maturidade de produto mapeado na torre.
- **Kaizen:** pedir para cada pessoa do squad (PO incluso) escrever em uma frase "nosso time existe para...". Comparar as respostas. A divergência revelada é o ponto de partida do propósito.
- **Âncora de dados:** existência de roadmap no padrão LM (sim/não); % de itens da sprint rastreáveis a um objetivo do roadmap.

### Estágio 2 — Confronto e Estruturação
O propósito está documentado e o primeiro roadmap existe — e ambos entram em disputa. Stakeholders contestam prioridades, demandas fora do roadmap pressionam por encaixe, e o PO oscila entre defender o plano e ceder. O propósito começa a aparecer como critério de decisão, mas ainda ganha quem insiste mais.
- **Exemplo:** duas diretorias pedem entregas conflitantes para o mesmo mês; o PO usa o roadmap para expor o conflito — e pela primeira vez a decisão sobe com transparência em vez de ser absorvida em silêncio.
- **Kaizen:** na próxima demanda conflitante, usar explicitamente o propósito e o roadmap como critério, documentando a decisão e o raciocínio. Repetir até virar hábito.
- **Âncora de dados:** % de demandas fora do roadmap aceitas sem repriorização explícita; frequência de atualização do roadmap.

### Estágio 3 — Normalização e Direcionamento
O roadmap é vivo, conhecido e usado. Demandas desalinhadas são questionadas de forma legítima: "isso é nossa responsabilidade?" é pergunta comum e bem recebida. O escopo é defendido com critérios claros, e existe inclusive o registro do que o squad *não* faz. A priorização considera dados de negócio, não só pressão.
- **Exemplo:** um pedido fora de escopo chega; o PO consulta o documento de fronteiras do produto, indica o squad correto e a demanda é redirecionada sem atrito.
- **Kaizen:** criar e manter o documento "o que NÃO fazemos", listando tipos de demanda fora do escopo, e usá-lo como referência nas conversas de priorização.
- **Âncora de dados:** roadmap atualizado a cada ciclo; % de itens entregues alinhados a objetivos declarados.

### Estágio 4 — Performance e Autonomia
O squad propõe iniciativas próprias baseadas em dados e contexto de negócio — não espera ser alimentado. Identifica oportunidades, valida hipóteses e argumenta com evidências. Stakeholders confiam na direção que o PO propõe e o roadmap do squad influencia o planejamento da torre, não só reflete.
- **Exemplo:** o PO apresenta à liderança uma proposta de iniciativa sustentada por dados de uso e projeção de impacto — e a iniciativa entra no planejamento do trimestre por mérito, não por pedido.
- **Kaizen:** revisar trimestralmente se o propósito ainda reflete a estratégia e compartilhar os critérios de priorização com os demais POs da torre.
- **Âncora de dados:** % de iniciativas originadas pelo próprio squad; aderência entrega vs. roadmap por trimestre.

---

## Dimensão 7 — Validação de Épicos

**Descrição:** Rigor da porta de entrada do produto: nenhum épico entra em execução sem requisitos levantados por completo, quebra em user stories junto ao PO, dependências mapeadas, esforço estimado e prazo confirmado como viável. Se as estimativas não fecham com a data prometida, o risco é sinalizado antes — não no meio da execução.

**Narrativa:** O épico entrou em execução com o escopo "enunciado, não investigado". Na terceira sprint, o time descobre que metade dos requisitos não existia e que há uma dependência de outro time com fila de dois meses. O atraso que era evitável vira crise com visibilidade da liderança — tarde demais para qualquer plano B barato.

### Estágio 1 — Formação e Alinhamento Inicial
Épicos entram em execução por decisão de cronograma, não por prontidão: sem levantamento completo de requisitos, sem quebra em histórias, sem confirmação de viabilidade do prazo. O risco de atraso é invisível até se materializar. O time constrói enquanto descobre o que deveria construir.
- **Exemplo real:** épicos sem validação prévia entrando em execução — risco de atraso que só aparece tarde, gap mapeado na torre.
- **Kaizen:** para o próximo épico, aplicar um checklist mínimo antes do início: requisitos completos? histórias escritas? dependências listadas? estimativas fecham com o prazo? Registrar as respostas, mesmo que a decisão seja começar assim mesmo.
- **Âncora de dados:** % de épicos iniciados com os 5 critérios de validação; desvios de prazo detectados após o início da execução.

### Estágio 2 — Confronto e Estruturação
A validação existe como prática declarada, mas disputada: a pressão por "começar logo" colide com o tempo de levantamento. Alguns épicos passam pela validação completa, outros furam sob urgência — e a diferença de resultado entre os dois grupos começa a ficar visível e a alimentar a discussão.
- **Exemplo:** dois épicos começam no mesmo mês — um validado, um não. Três sprints depois, o validado segue no prazo e o outro já estourou 40%. O contraste vira o argumento definitivo na retro.
- **Kaizen:** comparar formalmente prazo previsto vs. realizado entre épicos validados e não validados. Levar o número para a liderança — deixar o dado defender a prática.
- **Âncora de dados:** % de épicos validados antes do início; desvio de prazo por grupo (validado vs. não validado).

### Estágio 3 — Normalização e Direcionamento
Nenhum épico entra sem validação — e a regra é defendida pelo squad, não imposta. SM e PO conduzem juntos o levantamento; as histórias saem escritas e estimadas; prazos inviáveis são sinalizados antes do início, com alternativas de escopo na mesa. A validação virou a conversa mais barata do projeto.
- **Exemplo real (case Optimus):** o risco de não-entrega de 9 épicos até a release foi eliminado pela validação — o SM puxou o PO, conduziram o levantamento completo, escreveram as USs e as estimativas confirmaram que o prazo era viável.
- **Kaizen:** padronizar o rito de validação com prazo interno (ex.: épico validado em até N dias do aceite) para que a porta de entrada não vire gargalo.
- **Âncora de dados:** 100% dos épicos com validação registrada; tempo médio de validação; riscos sinalizados antes vs. depois do início.

### Estágio 4 — Performance e Autonomia
A validação alimenta o planejamento da torre: estimativas de épicos calibradas por histórico real, riscos sinalizados com antecedência viram decisão de portfólio (repriorizar, faseiar, reforçar), e o squad renegocia escopo ou prazo com dados antes de qualquer comprometimento externo. Épicos do squad são referência de confiabilidade.
- **Exemplo:** na entrada de um épico G, as estimativas indicam 20% de estouro sobre a data desejada; o squad propõe um faseamento em duas releases com o valor principal na primeira — e a liderança decide com dois meses de antecedência, não duas semanas.
- **Kaizen:** medir a precisão das validações (estimado vs. realizado por épico) e usar o histórico para calibrar as próximas — transformar validação em previsão auditável.
- **Âncora de dados:** desvio médio estimado vs. realizado por épico ≤ 20%; zero riscos de prazo descobertos após o início.

---

## Dimensão 8 — Escrita & Fatiamento de Histórias

**Descrição:** Qualidade das user stories: orientadas a valor, testáveis e dimensionadas para caber em uma sprint de 1 semana. A quebra é por fatia de valor perceptível, não por camada técnica — o usuário vê progresso a cada ciclo, e o risco do projeto se distribui em micro-entregas.

**Narrativa:** A história está "em desenvolvimento" há três semanas. Ninguém consegue dizer quanto falta, o PO não tem nada para mostrar ao stakeholder e o dev jura que "está quase". Quando finalmente entrega, descobre-se que metade não era o que o negócio precisava — três semanas de feedback perdidas.

### Estágio 1 — Formação e Alinhamento Inicial
Demandas entram grandes e permanecem grandes. Histórias são títulos vagos sem critérios de aceite; quando há quebra, é por tarefa técnica (backend, frontend, testes), que organiza o trabalho internamente mas não gera valor intermediário. Itens atravessam sprints sem progresso visível.
- **Exemplo real:** histórias grandes demais para uma sprint e user stories mal escritas — dores mapeadas na trilha de POs.
- **Kaizen:** pegar o maior item em andamento e perguntar: "qual a menor parte disso que poderíamos entregar e receber feedback?". Quebrar nessa parte e entregar.
- **Âncora de dados:** % de histórias que atravessam mais de uma sprint; % de histórias com critérios de aceite escritos.

### Estágio 2 — Confronto e Estruturação
O time tenta fatiar por valor e descobre que é difícil: as primeiras tentativas geram fatias artificiais, o PO e o time divergem sobre o que é "valor perceptível", e volta e meia a quebra técnica reaparece por conforto. O tamanho das histórias diminui, mas ainda sem critério claro.
- **Exemplo:** o time quebra um épico em "criar tabela", "criar API", "criar tela" — e na retro percebe que nenhuma das três fatias podia ser validada pelo usuário. A discussão que se segue redefine o que é fatia de valor para o squad.
- **Kaizen:** mudar a pergunta da quebra: em vez de "quais tarefas técnicas?", perguntar "qual a menor fatia que o usuário pode ver funcionando?". Praticar em uma história por refinamento.
- **Âncora de dados:** tamanho médio das histórias (dias de cycle time); % de fatias validáveis pelo usuário.

### Estágio 3 — Normalização e Direcionamento
Existe critério explícito de tamanho máximo — e o time o respeita. Histórias que excedem são quebradas antes de entrar no fluxo. As USs seguem padrão de escrita com valor e aceite testável, saem do refinamento prontas, e entregas pequenas e frequentes são valorizadas pelo próprio time.
- **Exemplo:** no refinamento, uma história estimada acima do critério é automaticamente devolvida para fatiamento — sem debate, porque a regra é do time.
- **Kaizen:** acompanhar se os itens entregues respeitam o critério de tamanho; se muitos fogem do padrão, revisar o critério (ou a disciplina) com o time.
- **Âncora de dados:** ≥ 90% das histórias dentro do critério de tamanho; distribuição de cycle time comprimindo (cauda curta).

### Estágio 4 — Performance e Autonomia
Decomposição excelente é norma e os stakeholders pedem entregas incrementais — entenderam o valor. O time não trabalha mais que poucos dias sem entregar algo tangível; o risco de projeto está distribuído em micro-entregas e o feedback do usuário chega semanalmente. Técnicas variadas (story mapping, example mapping) são usadas conforme o problema.
- **Exemplo:** um stakeholder que antes exigia "a entrega completa" agora pede o corte mínimo primeiro — porque aprendeu que ver funcionando em uma semana vale mais que esperar a versão total por dois meses.
- **Kaizen:** ensinar as técnicas de fatiamento aos demais squads e manter um catálogo de bons exemplos de quebra (antes/depois) da torre.
- **Âncora de dados:** intervalo máximo entre entregas tangíveis ≤ 3 dias úteis; histograma de lead time sem cauda longa.

---

## Dimensão 9 — Comunicação de Valor

**Descrição:** Capacidade do time e do PO de traduzir entrega técnica em resultado de negócio: reviews que contam história de valor, comunicação ascendente que responde "o que isso mudou para a LM" e stakeholders que entendem o que receberam — não apenas que "a sprint fechou".

**Narrativa:** A review termina e o stakeholder pergunta: "tá, mas o que isso muda pra mim?". O time acabou de demonstrar quinze itens, todos DONE, todos dentro da DoD — e ninguém na sala consegue conectar a lista com um resultado de negócio. A entrega existiu; o valor, ninguém viu.

### Estágio 1 — Formação e Alinhamento Inicial
A comunicação é uma lista de tarefas: a review (quando acontece) percorre cards, o reporte ascendente fala de "itens concluídos" e "percentual da sprint". Stakeholders não participam ou participam calados. O valor da entrega fica implícito — e quando questionado, ninguém sabe articulá-lo.
- **Exemplo:** o status report mensal lista 43 cards fechados; a diretoria lê e pergunta se o projeto está indo bem — porque a lista não responde.
- **Kaizen:** na próxima review, abrir cada demonstração com uma frase-padrão: "antes, [dor]; agora, [mudança]". Só isso — forçar a tradução dor → resultado em tudo que for mostrado.
- **Âncora de dados:** presença de stakeholders na review; % de itens comunicados com declaração de valor.

### Estágio 2 — Confronto e Estruturação
O time tenta comunicar valor e encontra resistência interna ("isso é papel do PO") e externa (stakeholders acostumados a cobrar cronograma, não resultado). As reviews melhoram, mas oscilam; o reporte ascendente mistura linguagem técnica e de negócio sem consistência. A disputa sobre "para quem comunicamos e o quê" está aberta — e é ela que constrói o padrão.
- **Exemplo:** o PO reformula a review para contar a história de um fluxo de usuário; metade dos stakeholders elogia, a outra metade pede "a lista de sempre" — e o squad decide manter os dois formatos por um ciclo até provar qual gera mais decisão.
- **Kaizen:** definir com os stakeholders qual pergunta o reporte deve responder (ex.: "o que mudou para o cliente este mês?") e reescrever o template a partir dela.
- **Âncora de dados:** decisões tomadas em review (repriorizações, aprovações); feedback qualitativo dos stakeholders.

### Estágio 3 — Normalização e Direcionamento
Reviews contam história de valor como padrão: contexto, dor, solução, resultado. O reporte ascendente conecta entregas a objetivos do roadmap e a métricas de negócio quando existem. Stakeholders participam ativamente porque a review virou fórum de decisão, não de prestação de contas.
- **Exemplo:** na review, a demonstração de uma automação vem acompanhada do número: "eliminamos 6 horas semanais de trabalho manual da equipe de operação" — e o stakeholder aprova a fase 2 na mesma reunião.
- **Kaizen:** incluir em toda entrega relevante a medição do resultado (antes/depois) e manter um registro de valor entregue por trimestre.
- **Âncora de dados:** % de entregas com resultado medido; participação recorrente de stakeholders-chave.

### Estágio 4 — Performance e Autonomia
O squad é fonte de informação estratégica: seu registro de valor alimenta decisões de portfólio, o PO comunica em linguagem de negócio com fluência e a liderança usa o material do squad como referência de comunicação para a torre. A pergunta "o que isso muda para a LM" é respondida antes de ser feita.
- **Exemplo:** o relatório trimestral do squad — valor entregue, resultados medidos, aprendizados — circula na diretoria como modelo, e outros squads pedem o template.
- **Kaizen:** padronizar o formato de narrativa de valor da torre a partir do modelo do squad e treinar os demais POs no formato.
- **Âncora de dados:** decisões de portfólio citando dados do squad; adoção do template por outros squads.

---
---

# EIXO TIME

---

## Dimensão 10 — Cultura, Conhecimento & Melhoria

**Descrição:** Segurança psicológica, distribuição de conhecimento (nenhum módulo com um único conhecedor) e melhoria contínua real — retrospectivas que geram ações com dono, prazo e verificação de efeito. É a dimensão onde a lente Tuckman opera de forma mais literal: é aqui que o time se forma, atrita, normaliza e performa como grupo humano.

**Narrativa:** Pedro é o único que sabe como funciona o módulo de pagamentos. Quando ele sai de férias, o time para. Na retro, todo mundo reclama dos mesmos problemas de sempre, anota em post-its, tira foto — e na semana seguinte ninguém lembra o que foi decidido. A retro virou terapia: desabafa e segue.

### Estágio 1 — Formação e Alinhamento Inicial
Conhecimento crítico vive na cabeça de uma ou duas pessoas, e silos são a norma aceita. Problemas são tratados como falha individual — "quem fez isso?" é mais comum que "que condição permitiu isso?". Retros, quando acontecem, não geram ação implementada. Não há espaço seguro para admitir erro ou dizer "não sei".
- **Exemplo:** quando o especialista do módulo crítico pede demissão, o time descobre que não existe documentação nem segunda pessoa que conheça o código — o conhecimento foi embora junto.
- **Kaizen:** mapear quais áreas do sistema só uma pessoa conhece e listar os nomes. Esse mapa de risco é o ponto de partida. Na próxima falha, trocar "quem errou?" por "o que no sistema permitiu esse erro?" — e documentar a resposta.
- **Âncora de dados:** nº de módulos com conhecedor único; % de ações de retro implementadas.

### Estágio 2 — Confronto e Estruturação
O time reconhece os silos e o teatro das retros — e começa o atrito produtivo: pair programming é experimentado (e disputado: "atrasa a entrega"), discordâncias antes engolidas agora são verbalizadas, e as primeiras discussões francas sobre formas de trabalho acontecem. É desconfortável — e é exatamente o Storming fazendo seu trabalho.
- **Exemplo:** a primeira retro em que alguém discorda abertamente do colega sênior termina tensa — mas a ação que sai dela é a primeira em meses que é de fato implementada.
- **Kaizen:** escolher UMA ação por retro e transformá-la em item do backlog com dono e prazo. A retro seguinte começa verificando se foi feita. Uma ação implementada vale mais que dez anotadas.
- **Âncora de dados:** ações de retro com dono e prazo; % implementadas até a retro seguinte.

### Estágio 3 — Normalização e Direcionamento
Há regra explícita: nenhum módulo pode ter apenas um conhecedor — e o time monitora o mapa de conhecimento ativamente. Melhorias viram ações com dono, prazo e verificação de efeito; há ciclo de experimentar, medir e ajustar. Perguntar "não sei fazer isso, me ensina?" é normal e bem recebido. O onboarding de novos membros é estruturado.
- **Exemplo:** ao puxar uma tarefa da área mais concentrada, o time forma automaticamente uma dupla — a regra de distribuição roda sem precisar ser lembrada.
- **Kaizen:** conectar experimentos de melhoria com dados: "tentamos X, o resultado foi Y". Padronizar o que funciona, aprender com o que não funciona.
- **Âncora de dados:** zero módulos com conhecedor único; ciclo experimento → medição fechado por sprint.

### Estágio 4 — Performance e Autonomia
Melhoria contínua é cultura, não evento. O time questiona o status quo com segurança, conecta experimentos a resultados de negócio e reserva tempo para ensinar. Conhecimento novo é compartilhado proativamente com outros squads. Aprender é tão valorizado quanto entregar — e o time sabe demonstrar que uma coisa alimenta a outra.
- **Exemplo:** o squad apresenta num fórum da torre o experimento do trimestre — o que tentou, o que mediu, o que padronizou — e dois squads adotam a prática no mês seguinte.
- **Kaizen:** institucionalizar a troca entre squads: fóruns de aprendizado, documentação de padrões reutilizáveis, rodízio de apresentações. Transformar aprendizado local em conhecimento da torre.
- **Âncora de dados:** experimentos compartilhados por trimestre; práticas do squad adotadas por outros times.

---
---

# Apêndice — Decisões de design do modelo

1. **Métricas desceram de teto para piso.** No modelo original, percentis eram nível 4. No contexto LM, dados confiáveis e atualizados diariamente são requisito de base ("inegociável") — por isso o estágio 1 descreve a ausência/desatualização dos indicadores e o estágio 4 descreve compromissos ancorados em P85 e Cone.

2. **O estágio 2 abraça o Storming literalmente.** Em todas as dimensões, o estágio 2 descreve atrito como parte esperada da jornada — disputa de interpretação de métricas, conflito sobre DoR, resistência a limites. Isso dá ao SM e ao PO licença narrativa para atravessar o conflito sem que pareça regressão.

3. **Âncoras de dados em todos os estágios.** Cada célula da matriz tem indicadores objetivos verificáveis no Dashboard — a semente da fusão MMA × Dashboard. A promoção de estágio deixa de ser autodeclaração e passa a ser defensável com evidência.

4. **Kaizens de estágio 4 são de expansão, não de manutenção.** O teto do modelo aponta para fora do squad: apadrinhar times, publicar padrões, alimentar a torre. Resolve a saturação do modelo original (dez Kaizens "mantenha esse nível").

5. **Gaps da seção 10 do modus operandi = estágio 1; padrão das seções 2–8 = estágios 3–4.** As descrições de nível baixo citam os gaps reais mapeados (PDTI/indicadores desatualizados nos 4 SMs, POs sem roadmap, épicos sem validação, cerimônias como obrigação). O case Optimus ancora o estágio 3 de Validação de Épicos. O modelo descreve a realidade da LM, não um framework genérico.

6. **"Autonomia de Processo" não é dimensão.** É a descrição transversal do estágio 4 — um squad autônomo é um squad maduro em todas as dimensões. Como dimensão separada, contaria a mesma coisa duas vezes.
