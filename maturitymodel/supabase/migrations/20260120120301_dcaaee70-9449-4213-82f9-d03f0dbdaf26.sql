-- Add Kanban state columns to assessment_theme_scores
ALTER TABLE assessment_theme_scores
ADD COLUMN IF NOT EXISTS kanban_status TEXT DEFAULT 'backlog',
ADD COLUMN IF NOT EXISTS kanban_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS deadline DATE;

-- Create custom_kaizens table for user-created cards
CREATE TABLE public.custom_kaizens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'backlog',
  display_order INTEGER DEFAULT 0,
  deadline DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.custom_kaizens ENABLE ROW LEVEL SECURITY;

-- RLS policies for custom_kaizens
CREATE POLICY "Authenticated users can view custom kaizens"
ON public.custom_kaizens
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create custom kaizens"
ON public.custom_kaizens
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update custom kaizens"
ON public.custom_kaizens
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete custom kaizens"
ON public.custom_kaizens
FOR DELETE
USING (auth.uid() IS NOT NULL);