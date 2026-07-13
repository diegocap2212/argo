-- Drop the existing open policies for UPDATE and DELETE
DROP POLICY IF EXISTS "Anyone can update teams" ON public.teams;
DROP POLICY IF EXISTS "Anyone can delete teams" ON public.teams;

-- Create new policies requiring authentication
CREATE POLICY "Authenticated users can update teams" 
ON public.teams 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete teams" 
ON public.teams 
FOR DELETE 
USING (auth.uid() IS NOT NULL);