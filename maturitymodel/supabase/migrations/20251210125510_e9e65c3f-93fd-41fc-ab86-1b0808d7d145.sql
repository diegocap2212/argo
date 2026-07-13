-- Add narrative column to themes table
ALTER TABLE public.themes ADD COLUMN narrative TEXT;

-- Populate narratives for all 10 themes
UPDATE public.themes SET narrative = 'Na reunião de priorização, três pessoas defendem três direções diferentes. Uma quer acelerar checkout, outra quer melhorar busca, outra quer corrigir bugs críticos. Sem clareza de propósito, cada sprint é uma batalha política — e o time nunca sabe se está ganhando ou perdendo.' WHERE name = 'Propósito e Contexto';

UPDATE public.themes SET narrative = 'Perguntam pro time: "o que está em andamento?" Silêncio. Alguém abre uma planilha desatualizada. Outro olha no Slack. Outro lembra de cabeça. Três fontes, três respostas diferentes. O trabalho existe, mas ninguém vê.' WHERE name = 'Visualização';

UPDATE public.themes SET narrative = 'O time tem 5 pessoas e 17 itens "em progresso". Todo mundo começa tudo, ninguém termina nada. Quando o gestor pergunta "quando vai ficar pronto?", a resposta honesta seria: "quando alguém parar de me interromper com coisas novas".' WHERE name = 'Limite WIP';

UPDATE public.themes SET narrative = 'Uma história entra como "melhorar a experiência do carrinho". Três semanas depois, ainda está "em desenvolvimento". O dev explica: "é que envolvia mais coisas do que a gente imaginava". Ninguém perguntou o óbvio: dava pra quebrar antes de começar?' WHERE name = 'Quebra de Trabalho';

UPDATE public.themes SET narrative = 'O quadro mostra 8 itens em "Code Review" há uma semana. Ninguém move, ninguém pergunta, ninguém destrava. O fluxo parou, mas o time segue fingindo que está trabalhando — porque "tecnicamente" as tarefas estão em andamento.' WHERE name = 'Gestão de Fluxo';

UPDATE public.themes SET narrative = 'O dev diz: "terminei". O QA pergunta: "cadê os testes?". O dev: "não sabia que precisava". O PO: "mas não está em prod ainda". Três pessoas, três definições de "pronto". A história volta pro backlog.' WHERE name = 'Políticas e Definições de Pronto';

UPDATE public.themes SET narrative = 'A daily acontece todo dia às 9h. O problema: ninguém sabe pra que serve. Cada pessoa fala o que fez, ninguém escuta, todo mundo sai aliviado que acabou. É ritual sem propósito — burocracia disfarçada de agilidade.' WHERE name = 'Cadências e Rituais';

UPDATE public.themes SET narrative = 'Pedro é o único que sabe como funciona o módulo de pagamentos. Quando ele sai de férias, o time para. Quando ele pede demissão, entra em pânico. O conhecimento estava na cabeça dele — e agora foi embora junto.' WHERE name = 'Cultura e Conhecimento';

UPDATE public.themes SET narrative = 'Na retro, todo mundo reclama dos mesmos problemas de sempre. Anotam em post-its, tiram foto, mandam pro Slack. Na semana seguinte, ninguém lembra o que foi decidido. A retro virou terapia — desabafa e segue.' WHERE name = 'Melhoria Colaborativa';

UPDATE public.themes SET narrative = 'O stakeholder pergunta: "conseguem entregar até o final do mês?". O time responde: "vamos tentar". Ninguém sabe o lead time real, ninguém olha throughput, ninguém mede nada. Toda promessa é chute — e todo chute vira cobrança.' WHERE name = 'Métricas e Previsibilidade';