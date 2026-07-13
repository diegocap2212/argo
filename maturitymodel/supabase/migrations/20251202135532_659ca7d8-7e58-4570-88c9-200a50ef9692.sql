-- Add UPDATE policy for assessment_theme_scores
CREATE POLICY "Anyone can update assessment theme scores"
ON public.assessment_theme_scores
FOR UPDATE
USING (true);

-- Add UPDATE policy for assessments
CREATE POLICY "Anyone can update assessments"
ON public.assessments
FOR UPDATE
USING (true);