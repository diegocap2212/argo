-- Simplificar theme_level_descriptions: description max 20 palavras, next_step max 15 palavras
-- Foco em linguagem comportamental, sem receitas prescritivas

-- Propósito e Contexto (theme_id: 81ea1062-5a65-4ded-bf76-de15da41fc0b)
UPDATE theme_level_descriptions SET 
  description = 'Time não sabe explicar por que existe.',
  next_step = 'Pergunte ao time: se sumirmos, quem sentiria falta?'
WHERE theme_id = '81ea1062-5a65-4ded-bf76-de15da41fc0b' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Cada pessoa entende sua função, mas não há visão comum.',
  next_step = 'Documente o propósito em uma frase visível para todos.'
WHERE theme_id = '81ea1062-5a65-4ded-bf76-de15da41fc0b' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Propósito é conhecido, começa a aparecer em discussões.',
  next_step = 'Use o propósito como critério na planning.'
WHERE theme_id = '81ea1062-5a65-4ded-bf76-de15da41fc0b' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Time questiona demandas que não se alinham ao propósito.',
  next_step = 'Conecte o propósito a uma métrica observável.'
WHERE theme_id = '81ea1062-5a65-4ded-bf76-de15da41fc0b' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Time propõe iniciativas baseadas em dados e contexto de negócio.',
  next_step = 'Faça retrospectiva trimestral do propósito.'
WHERE theme_id = '81ea1062-5a65-4ded-bf76-de15da41fc0b' AND level_number = 4;

-- Visualização (theme_id: f8e5618c-38f8-4cb4-b8a6-efcd60baa7cf)
UPDATE theme_level_descriptions SET 
  description = 'Trabalho está na cabeça das pessoas, sem visão compartilhada.',
  next_step = 'Cada pessoa anota suas tarefas num mural visível.'
WHERE theme_id = 'f8e5618c-38f8-4cb4-b8a6-efcd60baa7cf' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Existe quadro, mas só mostra trabalho individual.',
  next_step = 'Crie quadro único do time: A Fazer, Fazendo, Feito.'
WHERE theme_id = 'f8e5618c-38f8-4cb4-b8a6-efcd60baa7cf' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Todo trabalho está num quadro único. Dá pra ver o que está parado.',
  next_step = 'Evolua colunas para mostrar etapas reais do fluxo.'
WHERE theme_id = 'f8e5618c-38f8-4cb4-b8a6-efcd60baa7cf' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Quadro mostra fluxo real. Dá pra ver onde acumula.',
  next_step = 'Destaque visualmente itens antigos na mesma coluna.'
WHERE theme_id = 'f8e5618c-38f8-4cb4-b8a6-efcd60baa7cf' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Visualização com métricas. Time usa dados para decidir.',
  next_step = 'Automatize alertas quando itens envelhecem.'
WHERE theme_id = 'f8e5618c-38f8-4cb4-b8a6-efcd60baa7cf' AND level_number = 4;

-- Limite WIP (theme_id: 46f63e24-b5d0-4554-928b-eed0e3064807)
UPDATE theme_level_descriptions SET 
  description = 'Não existe limite. Todos trabalham em tudo ao mesmo tempo.',
  next_step = 'Conte quantos itens cada pessoa está tocando agora.'
WHERE theme_id = '46f63e24-b5d0-4554-928b-eed0e3064807' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time percebe que tudo urgente significa nada fluindo.',
  next_step = 'Defina regra: máximo 2 itens por pessoa.'
WHERE theme_id = '46f63e24-b5d0-4554-928b-eed0e3064807' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Limite WIP por pessoa existe e é respeitado.',
  next_step = 'Defina WIP por coluna, não só por pessoa.'
WHERE theme_id = '46f63e24-b5d0-4554-928b-eed0e3064807' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'WIP por coluna. Quando estoura, time para e destranca.',
  next_step = 'Monitore violações de WIP. Se sempre estoura, ajuste.'
WHERE theme_id = '46f63e24-b5d0-4554-928b-eed0e3064807' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Sistema puxado maduro. Trabalho só entra quando há capacidade.',
  next_step = 'Otimize limites com base em dados históricos.'
WHERE theme_id = '46f63e24-b5d0-4554-928b-eed0e3064807' AND level_number = 4;

-- Quebra de Trabalho (theme_id: 381498e0-7e40-4a54-8343-aa6b3968eb7d)
UPDATE theme_level_descriptions SET 
  description = 'Demandas entram grandes e saem grandes. Sem quebra.',
  next_step = 'Pegue o maior item e quebre em partes menores.'
WHERE theme_id = '381498e0-7e40-4a54-8343-aa6b3968eb7d' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time tenta quebrar, mas pensa em tarefas técnicas.',
  next_step = 'Quebre por valor entregue, não por camada técnica.'
WHERE theme_id = '381498e0-7e40-4a54-8343-aa6b3968eb7d' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Itens consideram valor, mas ainda ficam grandes demais.',
  next_step = 'Se parece que leva mais de 3 dias, quebre mais.'
WHERE theme_id = '381498e0-7e40-4a54-8343-aa6b3968eb7d' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Itens pequenos (1-3 dias). Entrega de valor frequente.',
  next_step = 'Reduza dependências. Cada item pode ser deployado sozinho.'
WHERE theme_id = '381498e0-7e40-4a54-8343-aa6b3968eb7d' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Decomposição excelente. Entrega contínua com baixo risco.',
  next_step = 'Ensine stakeholders a pensar em incrementos.'
WHERE theme_id = '381498e0-7e40-4a54-8343-aa6b3968eb7d' AND level_number = 4;

-- Gestão de Fluxo (theme_id: c30bbea9-bbed-43ec-a6b7-5e4c5e51d2d9)
UPDATE theme_level_descriptions SET 
  description = 'Não existe consciência de fluxo. Trabalho é empurrado.',
  next_step = 'Visualize o caminho que um item percorre até ser entregue.'
WHERE theme_id = 'c30bbea9-bbed-43ec-a6b7-5e4c5e51d2d9' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Time percebe gargalos, mas não age sistematicamente.',
  next_step = 'Quando algo trava, registre onde e por quanto tempo.'
WHERE theme_id = 'c30bbea9-bbed-43ec-a6b7-5e4c5e51d2d9' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Gargalos são identificados. Time discute na daily.',
  next_step = 'Priorize destravar o que está mais perto de terminar.'
WHERE theme_id = 'c30bbea9-bbed-43ec-a6b7-5e4c5e51d2d9' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Fluxo gerenciado ativamente. Bloqueios resolvidos no mesmo dia.',
  next_step = 'Use classes de serviço para tratar tipos diferentes.'
WHERE theme_id = 'c30bbea9-bbed-43ec-a6b7-5e4c5e51d2d9' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Fluxo otimizado. Time prevê e previne gargalos.',
  next_step = 'Analise padrões históricos para antecipar problemas.'
WHERE theme_id = 'c30bbea9-bbed-43ec-a6b7-5e4c5e51d2d9' AND level_number = 4;

-- Políticas e Definições de Pronto (theme_id: 6c2f4c92-06a6-44ed-8b45-7d2c6e4c5eb6)
UPDATE theme_level_descriptions SET 
  description = 'Não existem critérios claros de quando algo está pronto.',
  next_step = 'Defina: o que significa "pronto" para o time?'
WHERE theme_id = '6c2f4c92-06a6-44ed-8b45-7d2c6e4c5eb6' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Critérios existem, mas nem todos seguem.',
  next_step = 'Cole os critérios no quadro. Valide antes de mover.'
WHERE theme_id = '6c2f4c92-06a6-44ed-8b45-7d2c6e4c5eb6' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'DoD respeitado. Trabalho não volta depois de pronto.',
  next_step = 'Crie DoR: o que precisa estar claro antes de começar.'
WHERE theme_id = '6c2f4c92-06a6-44ed-8b45-7d2c6e4c5eb6' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'DoR e DoD funcionam. Fluxo unidirecional.',
  next_step = 'Revise políticas periodicamente. O que não funciona?'
WHERE theme_id = '6c2f4c92-06a6-44ed-8b45-7d2c6e4c5eb6' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Políticas são vivas e evoluem com o time.',
  next_step = 'Documente e compartilhe políticas com outros times.'
WHERE theme_id = '6c2f4c92-06a6-44ed-8b45-7d2c6e4c5eb6' AND level_number = 4;

-- Cadências e Rituais (theme_id: d149ce8a-80ad-4c01-9e5c-c01c8e4ea8fa)
UPDATE theme_level_descriptions SET 
  description = 'Reuniões acontecem sem cadência ou pauta definida.',
  next_step = 'Defina uma reunião recorrente com pauta fixa.'
WHERE theme_id = 'd149ce8a-80ad-4c01-9e5c-c01c8e4ea8fa' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Cadências existem, mas nem todos participam ou valorizam.',
  next_step = 'Revise cada reunião: gera valor? Dura o certo?'
WHERE theme_id = 'd149ce8a-80ad-4c01-9e5c-c01c8e4ea8fa' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Rituais são regulares e respeitados pelo time.',
  next_step = 'Daily focada no fluxo. Planning com escopo fechado.'
WHERE theme_id = 'd149ce8a-80ad-4c01-9e5c-c01c8e4ea8fa' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Cadências otimizadas. Cada uma tem propósito claro.',
  next_step = 'Adicione refinamento regular para preparar o backlog.'
WHERE theme_id = 'd149ce8a-80ad-4c01-9e5c-c01c8e4ea8fa' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Sistema cadenciado completo. Time ajusta conforme necessidade.',
  next_step = 'Compartilhe boas práticas de cadências com outros times.'
WHERE theme_id = 'd149ce8a-80ad-4c01-9e5c-c01c8e4ea8fa' AND level_number = 4;

-- Cultura e Conhecimento (theme_id: 28bc7f52-0dbb-4b0d-87e6-38d91caba2b4)
UPDATE theme_level_descriptions SET 
  description = 'Conhecimento concentrado em poucas pessoas. Silos.',
  next_step = 'Identifique os maiores silos de conhecimento.'
WHERE theme_id = '28bc7f52-0dbb-4b0d-87e6-38d91caba2b4' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Consciência dos silos. Documentação pessoal existe.',
  next_step = 'Faça pair programming em vez de documentar.'
WHERE theme_id = '28bc7f52-0dbb-4b0d-87e6-38d91caba2b4' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Pair/mob programming ocasional. Conhecimento começa a distribuir.',
  next_step = 'Nenhum módulo pode ter só uma pessoa que sabe.'
WHERE theme_id = '28bc7f52-0dbb-4b0d-87e6-38d91caba2b4' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Conhecimento distribuído. 2+ pessoas sabem cada área crítica.',
  next_step = 'Crie cultura de aprendizado: tech talks, tempo de estudo.'
WHERE theme_id = '28bc7f52-0dbb-4b0d-87e6-38d91caba2b4' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Segurança psicológica alta. Conhecimento flui naturalmente.',
  next_step = 'Compartilhe conhecimento além do time.'
WHERE theme_id = '28bc7f52-0dbb-4b0d-87e6-38d91caba2b4' AND level_number = 4;

-- Melhoria Colaborativa (theme_id: e3a8c8a2-dbb7-4b9f-a9b7-2d9f8f8ec9b4)
UPDATE theme_level_descriptions SET 
  description = 'Não existe prática de melhoria contínua.',
  next_step = 'Faça uma retro simples: o que funcionou? O que não?'
WHERE theme_id = 'e3a8c8a2-dbb7-4b9f-a9b7-2d9f8f8ec9b4' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Retros acontecem, mas ações não são implementadas.',
  next_step = 'Escolha UMA ação por retro e acompanhe até completar.'
WHERE theme_id = 'e3a8c8a2-dbb7-4b9f-a9b7-2d9f8f8ec9b4' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Ações das retros são implementadas. Melhoria visível.',
  next_step = 'Meça o impacto das melhorias. O que mudou?'
WHERE theme_id = 'e3a8c8a2-dbb7-4b9f-a9b7-2d9f8f8ec9b4' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Melhoria é parte do trabalho. Time experimenta frequentemente.',
  next_step = 'Documente experimentos: hipótese, teste, resultado.'
WHERE theme_id = 'e3a8c8a2-dbb7-4b9f-a9b7-2d9f8f8ec9b4' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Cultura de experimentação. Time aprende e adapta rápido.',
  next_step = 'Compartilhe aprendizados com outros times.'
WHERE theme_id = 'e3a8c8a2-dbb7-4b9f-a9b7-2d9f8f8ec9b4' AND level_number = 4;

-- Métricas e Previsibilidade (theme_id: aa7d9f28-8b5d-4e9a-9c8b-1f6a9b8c7d6e)
UPDATE theme_level_descriptions SET 
  description = 'Não existem métricas. Prazos são chutes.',
  next_step = 'Comece a medir: quanto tempo cada item leva?'
WHERE theme_id = 'aa7d9f28-8b5d-4e9a-9c8b-1f6a9b8c7d6e' AND level_number = 0;

UPDATE theme_level_descriptions SET 
  description = 'Algumas métricas existem, mas não são usadas.',
  next_step = 'Calcule cycle time médio. Use para responder prazos.'
WHERE theme_id = 'aa7d9f28-8b5d-4e9a-9c8b-1f6a9b8c7d6e' AND level_number = 1;

UPDATE theme_level_descriptions SET 
  description = 'Cycle time e throughput conhecidos. Previsibilidade inicial.',
  next_step = 'Use percentis: "P50 é dia X, P85 é dia Y".'
WHERE theme_id = 'aa7d9f28-8b5d-4e9a-9c8b-1f6a9b8c7d6e' AND level_number = 2;

UPDATE theme_level_descriptions SET 
  description = 'Previsibilidade probabilística. Stakeholders confiam nos dados.',
  next_step = 'Defina SLAs por tipo de demanda.'
WHERE theme_id = 'aa7d9f28-8b5d-4e9a-9c8b-1f6a9b8c7d6e' AND level_number = 3;

UPDATE theme_level_descriptions SET 
  description = 'Métricas acionáveis. Decisões baseadas em dados históricos.',
  next_step = 'Analise tendências. Antecipe problemas antes de acontecerem.'
WHERE theme_id = 'aa7d9f28-8b5d-4e9a-9c8b-1f6a9b8c7d6e' AND level_number = 4;