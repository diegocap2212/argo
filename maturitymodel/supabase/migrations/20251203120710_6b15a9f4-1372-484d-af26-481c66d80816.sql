-- Renomear nível 1 de "Inicial" para "Reativo"
UPDATE public.levels 
SET name = 'Reativo', 
    short_description = 'Trabalho ainda reativo, com foco individual e primeiros passos de organização'
WHERE number = 1;