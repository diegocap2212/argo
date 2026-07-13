-- =====================================================================
-- Fase 0 — Hardening de RLS: isolamento por dono/time + enforce de aprovação
-- =====================================================================
-- Problema corrigido aqui: até esta migration, as tabelas de negócio
-- (teams, assessments, assessment_answers, assessment_theme_scores,
-- custom_kaizens) tinham policies "Anyone can..." (USING true) e/ou apenas
-- "auth.uid() IS NOT NULL". Resultado: QUALQUER usuário logado via/editava os
-- dados de TODOS os times de TODOS os clientes. Inaceitável em multi-cliente.
--
-- Esta migration:
--   1. Adiciona dono ao time  (teams.owner_id -> auth.users).
--   2. Cria funções de acesso (is_approved / can_access_team / can_access_assessment).
--   3. Substitui TODAS as policies permissivas por policies escopadas por dono.
--   4. Faz o acesso das tabelas-filhas cascatear pelo dono do time.
--
-- ATENÇÃO (dados existentes): times criados antes desta migration ficam com
-- owner_id = NULL e passam a ser visíveis SOMENTE para admins. Para devolver um
-- time legado a um dono específico, rode o backfill comentado no fim do arquivo.
-- Aplicar com:  supabase db push   (ou via painel SQL do Supabase).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Coluna de dono no time
-- ---------------------------------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);

-- ---------------------------------------------------------------------
-- 2. Funções de acesso (SECURITY DEFINER evita recursão de RLS)
-- ---------------------------------------------------------------------

-- Usuário aprovado (ou admin) — usado para bloquear escrita de quem ainda
-- não foi liberado pelo admin (profiles.approved).
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = _user_id AND approved = true
      );
$$;

-- O usuário atual é dono do time (ou admin)?
CREATE OR REPLACE FUNCTION public.can_access_team(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.teams
        WHERE id = _team_id AND owner_id = auth.uid()
      );
$$;

-- O usuário atual pode acessar o time-pai deste assessment?
CREATE OR REPLACE FUNCTION public.can_access_assessment(_assessment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = _assessment_id AND public.can_access_team(a.team_id)
  );
$$;

-- =====================================================================
-- 3. TEAMS — derrubar tudo que é permissivo e recriar escopado por dono
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can view teams"                         ON public.teams;
DROP POLICY IF EXISTS "Anyone can create teams"                       ON public.teams;
DROP POLICY IF EXISTS "Anyone can update teams"                       ON public.teams;
DROP POLICY IF EXISTS "Anyone can delete teams"                       ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can update teams"          ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can delete teams"          ON public.teams;
DROP POLICY IF EXISTS "Users can view their own teams or public teams" ON public.teams;

CREATE POLICY "Owners and admins can view teams"
  ON public.teams FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Approved users can create their own teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.is_approved(auth.uid()));

CREATE POLICY "Owners and admins can update teams"
  ON public.teams FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Owners and admins can delete teams"
  ON public.teams FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- =====================================================================
-- 4. ASSESSMENTS — escopo via dono do time
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can view assessments"                ON public.assessments;
DROP POLICY IF EXISTS "Anyone can create assessments"              ON public.assessments;
DROP POLICY IF EXISTS "Anyone can update assessments"              ON public.assessments;
DROP POLICY IF EXISTS "Authenticated users can view assessments"   ON public.assessments;
DROP POLICY IF EXISTS "Authenticated users can create assessments" ON public.assessments;
DROP POLICY IF EXISTS "Authenticated users can update assessments" ON public.assessments;

CREATE POLICY "Team owners can view assessments"
  ON public.assessments FOR SELECT TO authenticated
  USING (public.can_access_team(team_id));

CREATE POLICY "Team owners can create assessments"
  ON public.assessments FOR INSERT TO authenticated
  WITH CHECK (public.can_access_team(team_id) AND public.is_approved(auth.uid()));

CREATE POLICY "Team owners can update assessments"
  ON public.assessments FOR UPDATE TO authenticated
  USING (public.can_access_team(team_id))
  WITH CHECK (public.can_access_team(team_id));

CREATE POLICY "Team owners can delete assessments"
  ON public.assessments FOR DELETE TO authenticated
  USING (public.can_access_team(team_id));

-- =====================================================================
-- 5. ASSESSMENT_ANSWERS — escopo via assessment -> time
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can view assessment answers"                ON public.assessment_answers;
DROP POLICY IF EXISTS "Anyone can create assessment answers"              ON public.assessment_answers;
DROP POLICY IF EXISTS "Authenticated users can view assessment answers"   ON public.assessment_answers;
DROP POLICY IF EXISTS "Authenticated users can create assessment answers" ON public.assessment_answers;

CREATE POLICY "Team owners can view assessment answers"
  ON public.assessment_answers FOR SELECT TO authenticated
  USING (public.can_access_assessment(assessment_id));

CREATE POLICY "Team owners can create assessment answers"
  ON public.assessment_answers FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assessment(assessment_id) AND public.is_approved(auth.uid()));

CREATE POLICY "Team owners can update assessment answers"
  ON public.assessment_answers FOR UPDATE TO authenticated
  USING (public.can_access_assessment(assessment_id))
  WITH CHECK (public.can_access_assessment(assessment_id));

CREATE POLICY "Team owners can delete assessment answers"
  ON public.assessment_answers FOR DELETE TO authenticated
  USING (public.can_access_assessment(assessment_id));

-- =====================================================================
-- 6. ASSESSMENT_THEME_SCORES — escopo via assessment -> time
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can view assessment theme scores"                ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Anyone can create assessment theme scores"              ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Anyone can update assessment theme scores"              ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Authenticated users can view assessment theme scores"   ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Authenticated users can create assessment theme scores" ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Authenticated users can update assessment theme scores" ON public.assessment_theme_scores;

CREATE POLICY "Team owners can view theme scores"
  ON public.assessment_theme_scores FOR SELECT TO authenticated
  USING (public.can_access_assessment(assessment_id));

CREATE POLICY "Team owners can create theme scores"
  ON public.assessment_theme_scores FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assessment(assessment_id) AND public.is_approved(auth.uid()));

CREATE POLICY "Team owners can update theme scores"
  ON public.assessment_theme_scores FOR UPDATE TO authenticated
  USING (public.can_access_assessment(assessment_id))
  WITH CHECK (public.can_access_assessment(assessment_id));

CREATE POLICY "Team owners can delete theme scores"
  ON public.assessment_theme_scores FOR DELETE TO authenticated
  USING (public.can_access_assessment(assessment_id));

-- =====================================================================
-- 7. CUSTOM_KAIZENS — escopo via dono do time
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can view custom kaizens"   ON public.custom_kaizens;
DROP POLICY IF EXISTS "Authenticated users can create custom kaizens" ON public.custom_kaizens;
DROP POLICY IF EXISTS "Authenticated users can update custom kaizens" ON public.custom_kaizens;
DROP POLICY IF EXISTS "Authenticated users can delete custom kaizens" ON public.custom_kaizens;

CREATE POLICY "Team owners can view custom kaizens"
  ON public.custom_kaizens FOR SELECT TO authenticated
  USING (public.can_access_team(team_id));

CREATE POLICY "Team owners can create custom kaizens"
  ON public.custom_kaizens FOR INSERT TO authenticated
  WITH CHECK (public.can_access_team(team_id) AND public.is_approved(auth.uid()));

CREATE POLICY "Team owners can update custom kaizens"
  ON public.custom_kaizens FOR UPDATE TO authenticated
  USING (public.can_access_team(team_id))
  WITH CHECK (public.can_access_team(team_id));

CREATE POLICY "Team owners can delete custom kaizens"
  ON public.custom_kaizens FOR DELETE TO authenticated
  USING (public.can_access_team(team_id));

-- =====================================================================
-- 8. (OPCIONAL) Backfill de times legados — descomente e ajuste o UUID.
--    Sem isto, times criados antes desta migration só aparecem para admins.
-- =====================================================================
-- UPDATE public.teams
--   SET owner_id = '00000000-0000-0000-0000-000000000000'  -- <- id do dono
--   WHERE owner_id IS NULL;
