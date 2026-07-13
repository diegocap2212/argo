-- Atualização completa das descrições de níveis por tema
-- Objetivo: melhorar distância técnica entre níveis, exemplos concretos e próximos passos

-- ==========================================
-- TEMA: Propósito e Contexto
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Time recém-formado que ainda não sabe explicar por que existe ou qual problema resolve para a empresa.',
  examples = 'Na daily alguém pergunta "qual é o nosso objetivo?" e ninguém consegue responder. O time trabalha em demandas avulsas sem conexão entre si.',
  next_step = 'Agende uma sessão de 1h com o time para responder: "Se nosso time sumisse amanhã, quem sentiria falta e por quê?"'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Propósito e Contexto') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Cada pessoa entende sua função técnica, mas o time não compartilha uma visão comum do problema de negócio que resolve.',
  examples = 'Desenvolvedor sabe que trabalha com "checkout", mas não sabe qual métrica de negócio o checkout impacta ou quem são os clientes.',
  next_step = 'Traga um stakeholder para explicar ao time: qual resultado de negócio vocês geram? Documente em uma frase visível para todos.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Propósito e Contexto') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'O propósito é conhecido pela maioria e começa a aparecer em discussões de priorização - mas ainda não filtra o que entra no backlog.',
  examples = 'Na planning, alguém diz "isso faz sentido para nosso propósito?" mas a demanda entra mesmo assim porque "o gerente pediu".',
  next_step = 'Na próxima planning, use o propósito como critério explícito: liste 3 demandas e vote quais se alinham mais com o propósito do time.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Propósito e Contexto') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'O propósito está conectado ao fluxo de valor: o time questiona ativamente demandas que não geram resultado para cliente ou negócio.',
  examples = 'Time recusa uma demanda do stakeholder dizendo: "isso não se conecta com nossos objetivos, podemos negociar outra solução?".',
  next_step = 'Conecte o propósito a uma métrica observável. Toda semana, revise: "nosso trabalho moveu essa métrica?"'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Propósito e Contexto') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'O time propõe iniciativas próprias baseadas em dados e entendimento profundo do negócio, não apenas executa demandas.',
  examples = 'Time identifica oportunidade de melhoria olhando dados de conversão e propõe experimento antes de qualquer pedido externo.',
  next_step = 'Faça retrospectiva trimestral do propósito: ainda faz sentido? Que resultados geramos? O que aprendemos sobre nosso contexto?'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Propósito e Contexto') AND level_number = 4;

-- ==========================================
-- TEMA: Visualização (foco em TORNAR VISÍVEL)
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'O trabalho está na cabeça das pessoas - não existe representação visual compartilhada do que está sendo feito.',
  examples = 'Pergunta ao colega "o que você está fazendo?" é a única forma de saber. Cada um tem anotações pessoais que ninguém mais vê.',
  next_step = 'Peça que cada pessoa cole post-its no mural com suas 3 tarefas atuais. Não precisa de colunas ainda, só tornar visível.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Visualização') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Existe algum quadro ou ferramenta, mas mostra apenas o trabalho individual - não há visão do trabalho do time como um todo.',
  examples = 'Cada pessoa tem sua lista no Jira, mas não existe um board único do time. O líder atualiza uma planilha separadamente.',
  next_step = 'Crie um quadro único do time com 3 colunas (A Fazer, Fazendo, Feito). Migre todos os itens individuais para esse quadro.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Visualização') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Todo trabalho do time está em um quadro único. O foco é ver STATUS: o que está parado, o que está andando, o que está bloqueado.',
  examples = 'Kanban do time com colunas claras. Itens bloqueados têm flag vermelha. Na daily, todos olham o quadro juntos.',
  next_step = 'Evolua o quadro para mostrar FLUXO: em vez de "Fazendo", mostre as etapas reais (Ex: Análise, Desenvolvimento, Code Review, Teste).'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Visualização') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'O quadro mostra o fluxo de valor com etapas reais. Agora é possível ver ONDE o trabalho acumula e ONDE há gargalos.',
  examples = 'Quadro com colunas: Backlog → Refinamento → Dev → Review → QA → Deploy. Fica visível que itens acumulam em "Review".',
  next_step = 'Adicione indicadores visuais de tempo: destaque itens há mais de X dias na mesma coluna (aging). Use cores para urgência.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Visualização') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Visualização integrada com métricas: dashboards mostram lead time, aging, WIP. O time usa dados visuais para tomar decisões rápidas.',
  examples = 'Dashboard ao lado do Kanban mostra: "3 itens há mais de 5 dias em Review". Time decide na daily priorizar reviews.',
  next_step = 'Automatize alertas visuais: quando um item envelhece ou WIP passa do limite, o sistema destaca automaticamente.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Visualização') AND level_number = 4;

-- ==========================================
-- TEMA: Limite WIP
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Não existe limite de trabalho em progresso. Todos trabalham em múltiplas coisas simultaneamente sem questionar.',
  examples = 'Na daily, cada pessoa lista 4-5 itens "em andamento". Ninguém acha isso estranho. "Multitasking é normal aqui."',
  next_step = 'Na próxima daily, conte: quantos itens cada pessoa está tocando? Levante a questão: "isso é sustentável?"'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Limite WIP') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'O time percebe que ter tudo urgente significa nada fluindo. Conversas sobre foco começam, mas ainda de forma individual.',
  examples = 'Alguém diz "preciso terminar isso antes de começar outra coisa". Mas não há acordo do time sobre isso.',
  next_step = 'Defina uma regra simples: cada pessoa trabalha em no máximo 2 itens ao mesmo tempo. Teste por 2 semanas.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Limite WIP') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Existe limite WIP por pessoa (2-3 itens). O time respeita individualmente, mas ainda não gerencia WIP coletivo por coluna.',
  examples = 'Dev diz "não posso pegar mais, estou no meu limite". Mas a coluna "Em Review" tem 10 itens esperando.',
  next_step = 'Defina WIP por coluna do fluxo, não só por pessoa. Ex: máximo 5 itens em "Desenvolvimento", máximo 3 em "Review".'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Limite WIP') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'WIP limitado por etapa do fluxo. Quando atinge limite, o time para de puxar novo trabalho e foca em destravar o gargalo.',
  examples = 'Review está no limite (3 itens). Devs param de começar novos itens e vão ajudar a revisar código dos colegas.',
  next_step = 'Monitore frequência de violações de WIP. Se sempre estoura, o limite está errado ou há problema sistêmico a resolver.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Limite WIP') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'WIP é gerenciado dinamicamente baseado em dados de fluxo. O time ajusta limites conforme capacidade e demanda mudam.',
  examples = 'Time percebe que lead time aumentou 20%. Reduz WIP de 5 para 4 para testar. Em 2 sprints, lead time normaliza.',
  next_step = 'Correlacione WIP com lead time em gráfico. Use para calibrar limites de forma contínua baseada em dados reais.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Limite WIP') AND level_number = 4;

-- ==========================================
-- TEMA: Gestão de Fluxo (foco em GERENCIAR o trabalho em movimento)
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Não há consciência de fluxo. Trabalho entra e sai sem ninguém saber quanto tempo leva ou onde trava.',
  examples = 'PM pergunta "quando fica pronto?" e ninguém sabe responder. Demandas somem por semanas sem ninguém perceber.',
  next_step = 'Comece a registrar data de início e fim de cada item. Só isso. Depois de 2 semanas, calcule a média.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Gestão de Fluxo') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time começa a perceber que alguns itens demoram muito. Há consciência de bloqueios, mas sem ação sistemática.',
  examples = 'Na retro alguém diz "aquele item ficou parado 2 semanas esperando ambiente". Mas na próxima sprint acontece igual.',
  next_step = 'Crie uma regra: todo item bloqueado há mais de 2 dias deve ser discutido na daily. Quem pode destravar?'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Gestão de Fluxo') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Bloqueios são tratados ativamente na daily. Time começa a medir lead time, mas ainda não usa para previsão.',
  examples = 'Daily inclui "check de bloqueios". Itens parados são escalados. Time sabe que lead time médio é ~8 dias.',
  next_step = 'Use lead time histórico para dar estimativas. Stakeholder pergunta "quando?" e você responde "nossos itens similares levam 5-10 dias".'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Gestão de Fluxo') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Fluxo é gerenciado ativamente: time monitora aging, prioriza destravar itens antigos, usa dados para previsão.',
  examples = 'Na daily, o primeiro foco é: "quais itens estão envelhecendo?" Time prioriza terminar antes de começar novo.',
  next_step = 'Implemente CFD (Cumulative Flow Diagram) para visualizar tendências de acúmulo e prever gargalos antes que explodam.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Gestão de Fluxo') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Fluxo otimizado com gestão proativa. Time usa CFD, percentis de lead time, e Monte Carlo para previsões probabilísticas.',
  examples = 'PM pergunta "quando entregamos 10 itens?". Time responde: "85% de chance até dia 15, 95% até dia 20" baseado em simulação.',
  next_step = 'Identifique padrões sazonais no fluxo. Há épocas com mais bloqueios? Prepare-se proativamente para esses períodos.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Gestão de Fluxo') AND level_number = 4;

-- ==========================================
-- TEMA: Políticas e Definições de Pronto
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Não existem critérios explícitos. Cada pessoa decide quando algo está "pronto" baseado em sua própria interpretação.',
  examples = 'Dev marca item como "Done" sem teste. QA reclama que sempre recebe coisa incompleta. Discussões frequentes sobre "o que é pronto".',
  next_step = 'Liste com o time: o que MÍNIMO precisa acontecer para um item ir de Dev para QA? Escreva em 3 bullets.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Políticas e Definições de Pronto') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Existem algumas definições informais, mas não são seguidas consistentemente por todos.',
  examples = 'Alguém escreveu "Definition of Done" no wiki há 6 meses. Metade do time nem sabe que existe.',
  next_step = 'Cole a definição de pronto FISICAMENTE ao lado do quadro Kanban. Toda vez que um item mover de coluna, verifique.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Políticas e Definições de Pronto') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Definições de pronto existem e são visíveis. Time as consulta, mas ainda há exceções frequentes "só dessa vez".',
  examples = 'DoD está no quadro: "código revisado, testes passando, documentação atualizada". Mas às vezes passa sem review "porque é urgente".',
  next_step = 'Registre TODAS as exceções por 2 sprints. Na retro, analise: são justificáveis ou estamos criando débito?'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Políticas e Definições de Pronto') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Políticas são respeitadas consistentemente. Exceções exigem decisão explícita do time com registro do risco.',
  examples = 'Dev pede "posso passar sem teste automatizado?". Time decide junto, registra débito técnico no backlog com prazo.',
  next_step = 'Crie critérios de ENTRADA também: o que precisa estar claro ANTES de começar um item? (Critérios de aceite, design definido, etc.)'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Políticas e Definições de Pronto') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Políticas de entrada e saída são claras e evoluem. Time as revisa regularmente baseado em aprendizados.',
  examples = 'Na retro trimestral, time revisa DoD: "Precisamos adicionar teste de acessibilidade? Nossos clientes pediram."',
  next_step = 'Conecte políticas com métricas de qualidade. Taxa de bug em produção caiu depois que adicionamos critério X?'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Políticas e Definições de Pronto') AND level_number = 4;

-- ==========================================
-- TEMA: Melhoria Colaborativa
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Problemas são vistos como falha individual. Não há espaço seguro para experimentar ou errar.',
  examples = 'Quando deploy quebra, primeira pergunta é "quem fez isso?". Pessoas escondem erros por medo de culpa.',
  next_step = 'Na próxima retro, estabeleça regra: "Não há culpados, há sistema. Que condição permitiu isso acontecer?"'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Melhoria Colaborativa') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time faz retros, mas ações raramente são implementadas. Há medo de propor mudanças "radicais".',
  examples = 'Retro gera 5 ações. Na próxima retro, nenhuma foi feita. "Não deu tempo." Mesmos problemas aparecem toda semana.',
  next_step = 'Limite ações de retro a UMA por vez. Defina dono e prazo. Na próxima retro, primeira pauta: "a ação foi feita?"'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Melhoria Colaborativa') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Ações de melhoria são implementadas, mas de forma reativa. Time resolve problemas que aparecem, não previne.',
  examples = 'Retro após incidente: "vamos adicionar monitoramento". Funciona. Mas só age quando algo já quebrou.',
  next_step = 'Reserve 10% da capacidade do time para melhorias proativas. Todo sprint, pelo menos 1 item de melhoria entra no planejamento.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Melhoria Colaborativa') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Time experimenta melhorias proativamente. Há segurança psicológica para propor ideias e testar hipóteses.',
  examples = 'Dev propõe: "e se fizermos pair programming por 1 semana?" Time topa testar. No fim, avaliam: funcionou?',
  next_step = 'Estruture experimentos: hipótese clara, como medir sucesso, prazo para avaliar. Crie "caderno de experimentos" do time.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Melhoria Colaborativa') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Melhoria contínua é parte da cultura. Time desafia status quo, compartilha aprendizados, e evolui constantemente.',
  examples = 'Time publica "learning report" mensal: o que testamos, o que aprendemos, o que mudamos. Outros times copiam práticas.',
  next_step = 'Conecte melhorias com resultados de negócio. Experimento X melhorou lead time em Y%, que impactou métrica Z.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Melhoria Colaborativa') AND level_number = 4;

-- ==========================================
-- TEMA: Cadências e Rituais
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Não há rituais regulares. Comunicação acontece de forma aleatória ou só quando há problema.',
  examples = 'Time não tem daily. Pessoas descobrem que colega está bloqueado 3 dias depois quando pedem update.',
  next_step = 'Implemente daily de 15 min: cada pessoa responde "o que fiz, o que farei, o que me bloqueia". Teste por 2 semanas.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cadências e Rituais') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Algumas cerimônias existem, mas são inconsistentes ou vistas como obrigação burocrática.',
  examples = 'Daily acontece às vezes. Quando acontece, dura 45 min e vira discussão técnica. Pessoas chegam atrasadas.',
  next_step = 'Defina timebox rígido: daily = 15 min máximo. Use timer visível. Discussões longas vão para depois com quem precisa.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cadências e Rituais') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Cerimônias básicas funcionam (daily, planning, retro) mas ainda não estão conectadas entre si de forma fluida.',
  examples = 'Daily foca no indivíduo. Planning define tarefas. Retro levanta problemas. Mas não há conexão clara entre elas.',
  next_step = 'Conecte os rituais: ações da retro viram itens do backlog. Daily foca no fluxo do time, não só no indivíduo.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cadências e Rituais') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Rituais são integrados e servem ao fluxo. Daily foca em destravar, planning considera capacidade real, retro gera ações implementadas.',
  examples = 'Daily começa pelo quadro: "o que está mais perto de terminar? O que bloqueia?" Não é report pessoal.',
  next_step = 'Adicione cadência de review com stakeholders. A cada 2 semanas, mostre o que entregou e colete feedback direto.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cadências e Rituais') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Cadências são otimizadas para o contexto do time. Time ajusta formato e frequência baseado em resultados.',
  examples = 'Time testou retro quinzenal em vez de semanal. Funcionou melhor. Mantiveram. Outro time faz diferente e tá ok.',
  next_step = 'Questione periodicamente: cada ritual ainda gera valor? O formato atual é o melhor? O que podemos simplificar?'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cadências e Rituais') AND level_number = 4;

-- ==========================================
-- TEMA: Cultura e Conhecimento
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Conhecimento está concentrado em poucas pessoas. Há silos e dependências críticas de indivíduos.',
  examples = 'Só o João sabe mexer no módulo X. Quando João tira férias, nada pode ser feito nessa área.',
  next_step = 'Identifique os 3 maiores silos de conhecimento. Planeje sessão de 1h onde o especialista ensina o básico para outros.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cultura e Conhecimento') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Há consciência dos silos. Algumas iniciativas de documentação existem, mas conhecimento ainda é pessoal.',
  examples = 'João documentou o módulo X num wiki. Mas o documento está desatualizado e ninguém mais consegue operar.',
  next_step = 'Em vez de documentar, faça pair programming. João trabalha junto com outra pessoa no módulo X por 2 sprints.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cultura e Conhecimento') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Pair programming ou mob programming acontece ocasionalmente. Conhecimento começa a se distribuir.',
  examples = 'Time faz pair programming 2x por semana. Maria agora também consegue mexer no módulo X, com ajuda.',
  next_step = 'Defina que NENHUM módulo pode ter apenas 1 pessoa que sabe. Mapeie e crie plano de redundância para áreas críticas.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cultura e Conhecimento') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Conhecimento é distribuído intencionalmente. Pelo menos 2 pessoas sabem operar cada área crítica.',
  examples = 'Matriz de skills mostra: módulo X = João (expert), Maria (pode operar), Pedro (aprendendo). Sem silos críticos.',
  next_step = 'Crie cultura de aprendizado contínuo: tech talks mensais, budget para cursos, tempo dedicado para estudar.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cultura e Conhecimento') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Time tem alta segurança psicológica e cultura de aprendizado. Conhecimento flui naturalmente entre todos.',
  examples = 'Qualquer pessoa pode pegar qualquer tarefa. Time compartilha aprendizados espontaneamente. "Descobri isso, olha que legal!"',
  next_step = 'Compartilhe conhecimento além do time: apresente em chapter, escreva blog post, mentore times mais novos.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Cultura e Conhecimento') AND level_number = 4;

-- ==========================================
-- TEMA: Métricas e Previsibilidade
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Não há métricas de fluxo. Previsibilidade é baseada em "feeling" ou pressão do stakeholder.',
  examples = 'PM pergunta "quando entrega?" Dev responde "acho que 2 semanas". Depois de 1 mês ainda não entregou.',
  next_step = 'Comece a coletar lead time: data que item entrou no fluxo até data que saiu. Faça isso por 4 semanas.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Métricas e Previsibilidade') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time coleta alguns dados mas não os usa para tomar decisões ou fazer previsões.',
  examples = 'Jira tem relatório de lead time. Ninguém olha. Estimativas continuam sendo chute baseado em pressão.',
  next_step = 'Na próxima estimativa, consulte o histórico: "itens parecidos levaram X-Y dias". Use isso como base, não o chute.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Métricas e Previsibilidade') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Lead time é monitorado e usado para dar estimativas. Time começa a perceber padrões.',
  examples = 'Time sabe: "bugs levam em média 3 dias, features médias levam 8 dias". Usa isso para responder stakeholders.',
  next_step = 'Adicione throughput (quantos itens por semana) e WIP às métricas. Correlacione: quando WIP sobe, o que acontece com lead time?'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Métricas e Previsibilidade') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Métricas de fluxo são usadas ativamente para gestão: lead time, throughput, WIP, CFD. Time detecta anomalias.',
  examples = 'Time percebe no CFD que banda "em teste" está crescendo. Age antes de virar crise: "vamos ajudar QA esta semana".',
  next_step = 'Implemente previsão probabilística: use percentis (P50, P85) em vez de média. "50% de chance de entregar em 5 dias, 85% em 8 dias".'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Métricas e Previsibilidade') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Previsibilidade madura com Monte Carlo e análise de risco. Time faz compromissos baseados em probabilidade.',
  examples = 'Para release grande, time roda simulação: "90% de chance de entregar 20 itens até dia 30". Stakeholder decide com dados.',
  next_step = 'Conecte métricas de fluxo com métricas de negócio. Reduzir lead time em X% impactou conversão? Use para priorizar melhorias.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Métricas e Previsibilidade') AND level_number = 4;

-- ==========================================
-- TEMA: Decomposição de Trabalho
-- ==========================================
UPDATE theme_level_descriptions SET 
  description = 'Demandas entram grandes e saem grandes. Não há quebra de trabalho em partes menores.',
  examples = 'Item no backlog: "Refatorar sistema de pagamentos". Fica 2 meses "em andamento" sem nada entregue.',
  next_step = 'Pegue o maior item do backlog agora. Pergunte: "qual é a menor parte disso que entrega valor?" Quebre em 3-5 itens.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Decomposição de Trabalho') AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time tenta quebrar itens, mas ainda pensa em tarefas técnicas em vez de entregas de valor.',
  examples = 'Feature quebrada em: "criar tabela", "fazer API", "fazer tela". Só entrega valor quando tudo está junto.',
  next_step = 'Quebre por VALOR, não por camada técnica. "Usuário consegue fazer X" é melhor que "backend da feature Y".'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Decomposição de Trabalho') AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Decomposição considera entrega de valor, mas itens ainda ficam grandes demais (mais de 5 dias em média).',
  examples = 'User story: "Como cliente, quero filtrar produtos". Parece pequena, mas leva 10 dias porque tem muitos filtros.',
  next_step = 'Use regra: se parece que vai levar mais de 3 dias, quebre mais. "Filtrar por preço" é um item, "filtrar por marca" é outro.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Decomposição de Trabalho') AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Itens são consistentemente pequenos (1-3 dias). Time entrega valor frequentemente com baixo risco.',
  examples = 'Time entrega 3-4 itens por semana. Cada um é independente e já entrega valor para usuário. Deploys são tranquilos.',
  next_step = 'Otimize decomposição para reduzir dependências. Itens devem poder ser desenvolvidos e deployados independentemente.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Decomposição de Trabalho') AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Decomposição é excelente. Time usa técnicas avançadas (story mapping, vertical slicing) e entrega continuamente.',
  examples = 'Feature grande é mapeada em story map. Time entrega fatia vertical por fatia, coletando feedback a cada entrega.',
  next_step = 'Ensine decomposição para stakeholders. Ajude-os a pensar em incrementos desde o pedido inicial, não só na execução.'
WHERE theme_id = (SELECT id FROM themes WHERE name = 'Decomposição de Trabalho') AND level_number = 4;