-- Adicionar colunas de exemplos concretos e anti-patterns para enriquecer o guia
ALTER TABLE public.theme_level_descriptions
ADD COLUMN examples text NULL,
ADD COLUMN anti_patterns text NULL;

-- Comentários explicando o propósito das colunas
COMMENT ON COLUMN public.theme_level_descriptions.examples IS 'Exemplos concretos de como esse tema se manifesta neste nível';
COMMENT ON COLUMN public.theme_level_descriptions.anti_patterns IS 'Sinais de que o time NÃO está neste nível mesmo achando que está';