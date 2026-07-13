-- Add perspective and is_official columns to assessments table
ALTER TABLE public.assessments 
ADD COLUMN perspective TEXT CHECK (perspective IN ('leadership', 'team', 'specialist')) DEFAULT 'team',
ADD COLUMN is_official BOOLEAN DEFAULT false;

-- Create index for faster queries on official assessments
CREATE INDEX idx_assessments_team_official ON public.assessments(team_id, is_official) WHERE is_official = true;

-- Add comment for documentation
COMMENT ON COLUMN public.assessments.perspective IS 'Who performed the assessment: leadership, team, or specialist';
COMMENT ON COLUMN public.assessments.is_official IS 'Whether this is the official/final assessment by the specialist';