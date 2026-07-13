-- Allow admins to update any profile (for approval management)
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (public.is_admin(auth.uid()));