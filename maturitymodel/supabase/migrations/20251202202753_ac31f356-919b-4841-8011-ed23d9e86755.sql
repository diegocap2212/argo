-- Add evolution_plan column to assessment_theme_scores
ALTER TABLE public.assessment_theme_scores 
ADD COLUMN evolution_plan text;