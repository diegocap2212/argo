-- Fix assessment_answers: require authentication for all operations
DROP POLICY IF EXISTS "Anyone can view assessment answers" ON public.assessment_answers;
DROP POLICY IF EXISTS "Anyone can create assessment answers" ON public.assessment_answers;

CREATE POLICY "Authenticated users can view assessment answers" 
ON public.assessment_answers 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create assessment answers" 
ON public.assessment_answers 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix assessments: require authentication for all operations
DROP POLICY IF EXISTS "Anyone can view assessments" ON public.assessments;
DROP POLICY IF EXISTS "Anyone can create assessments" ON public.assessments;
DROP POLICY IF EXISTS "Anyone can update assessments" ON public.assessments;

CREATE POLICY "Authenticated users can view assessments" 
ON public.assessments 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create assessments" 
ON public.assessments 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update assessments" 
ON public.assessments 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Fix assessment_theme_scores: require authentication for all operations
DROP POLICY IF EXISTS "Anyone can view assessment theme scores" ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Anyone can create assessment theme scores" ON public.assessment_theme_scores;
DROP POLICY IF EXISTS "Anyone can update assessment theme scores" ON public.assessment_theme_scores;

CREATE POLICY "Authenticated users can view assessment theme scores" 
ON public.assessment_theme_scores 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create assessment theme scores" 
ON public.assessment_theme_scores 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update assessment theme scores" 
ON public.assessment_theme_scores 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);