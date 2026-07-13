-- Add approved column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN approved boolean NOT NULL DEFAULT false;

-- Update existing profiles to be approved (so current users aren't locked out)
UPDATE public.profiles SET approved = true WHERE id IN (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
);

-- Create index for faster lookup
CREATE INDEX idx_profiles_approved ON public.profiles(approved);