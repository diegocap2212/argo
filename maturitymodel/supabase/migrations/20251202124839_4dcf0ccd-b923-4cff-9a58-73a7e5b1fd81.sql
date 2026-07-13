-- Drop existing tables (starting fresh)
DROP TABLE IF EXISTS public.assessments CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;

-- Drop old functions if they exist
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Create timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1. Teams table (simplified)
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tribe TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Public access (no auth for MVP)
CREATE POLICY "Anyone can view teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Anyone can create teams" ON public.teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update teams" ON public.teams FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete teams" ON public.teams FOR DELETE USING (true);

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Themes table
CREATE TABLE public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active themes" ON public.themes FOR SELECT USING (true);
CREATE POLICY "Anyone can manage themes" ON public.themes FOR ALL USING (true);

-- 3. Levels table
CREATE TABLE public.levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL UNIQUE CHECK (number >= 0 AND number <= 4),
  name TEXT NOT NULL,
  short_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view levels" ON public.levels FOR SELECT USING (true);
CREATE POLICY "Anyone can manage levels" ON public.levels FOR ALL USING (true);

-- 4. Theme Level Descriptions (description + next_step per theme/level)
CREATE TABLE public.theme_level_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL CHECK (level_number >= 0 AND level_number <= 4),
  description TEXT NOT NULL,
  next_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(theme_id, level_number)
);

ALTER TABLE public.theme_level_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view theme level descriptions" ON public.theme_level_descriptions FOR SELECT USING (true);
CREATE POLICY "Anyone can manage theme level descriptions" ON public.theme_level_descriptions FOR ALL USING (true);

-- 5. Questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  level_hint_from INTEGER NOT NULL DEFAULT 0 CHECK (level_hint_from >= 0 AND level_hint_from <= 4),
  level_hint_to INTEGER NOT NULL DEFAULT 4 CHECK (level_hint_to >= 0 AND level_hint_to <= 4),
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Anyone can manage questions" ON public.questions FOR ALL USING (true);

-- 6. Assessments table
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by TEXT,
  comments TEXT,
  overall_level NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view assessments" ON public.assessments FOR SELECT USING (true);
CREATE POLICY "Anyone can create assessments" ON public.assessments FOR INSERT WITH CHECK (true);

-- 7. Assessment Answers table
CREATE TABLE public.assessment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_value INTEGER NOT NULL CHECK (answer_value >= 0 AND answer_value <= 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view assessment answers" ON public.assessment_answers FOR SELECT USING (true);
CREATE POLICY "Anyone can create assessment answers" ON public.assessment_answers FOR INSERT WITH CHECK (true);

-- 8. Assessment Theme Scores table
CREATE TABLE public.assessment_theme_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  score NUMERIC(3,2) NOT NULL,
  inferred_level INTEGER NOT NULL CHECK (inferred_level >= 0 AND inferred_level <= 4),
  recommended_next_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, theme_id)
);

ALTER TABLE public.assessment_theme_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view assessment theme scores" ON public.assessment_theme_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can create assessment theme scores" ON public.assessment_theme_scores FOR INSERT WITH CHECK (true);

-- Insert default levels
INSERT INTO public.levels (number, name, short_description) VALUES
(0, 'Onboarding', 'Time em formação, criando base de entendimento e propósito'),
(1, 'Inicial (Inconsciente)', 'Trabalho individual sem visibilidade coletiva, apagando incêndios'),
(2, 'Visível (Emergente)', 'Time com quadro compartilhado, começando a se enxergar como equipe'),
(3, 'Fluxo Definido (Estruturado)', 'Workflow claro com etapas definidas, métricas e disciplina'),
(4, 'Gerenciado (Previsível)', 'Time maduro com previsibilidade probabilística e melhoria contínua');

-- Insert themes
INSERT INTO public.themes (name, description, display_order) VALUES
('Propósito & Contexto', 'Clareza sobre missão do time e alinhamento organizacional', 1),
('Visibilidade do Trabalho', 'Transparência sobre o que está sendo feito e bloqueios', 2),
('Foco & WIP', 'Limitação de trabalho em progresso e foco em terminar', 3),
('Políticas & Definição de Pronto', 'Critérios claros de conclusão e regras do time', 4),
('Cadência & Rituais', 'Cerimônias regulares que agregam valor', 5),
('Cultura & Conhecimento', 'Distribuição de conhecimento e colaboração', 6),
('Métricas & Previsibilidade', 'Uso de dados para decisões e previsões', 7);

-- Insert theme level descriptions (will be seeded via code for readability)