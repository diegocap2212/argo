-- =====================================================================
-- 1. Remove a trava de aprovação manual
-- =====================================================================
-- Por que: o cadastro exigia aprovação de um admin (profiles.approved)
-- antes de liberar o uso do portal. Deixa de ser necessário — qualquer
-- usuário autenticado passa a poder criar/editar seus próprios times e
-- assessments. A coluna profiles.approved e a tela /admin de aprovação
-- continuam existindo (dados históricos), mas não bloqueiam mais nada.
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

-- =====================================================================
-- 2. Corrige conteúdo do modelo que ainda citava "Dafiti"
-- =====================================================================
-- Por que: a descrição do tema "Propósito e Contexto" foi semeada com uma
-- referência hardcoded à Dafiti (cliente antigo). Corrige o dado já
-- gravado pela seed em 20260617140000_seed_real_model_content.sql.
UPDATE public.themes
SET description = 'Quão claro é o propósito do time e como ele entende seu contexto dentro da empresa e do negócio.'
WHERE id = '81ea1062-5a65-4ded-bf76-de15da41fc0b';
