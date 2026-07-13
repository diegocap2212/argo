-- 1. Create trigger for new users (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 2. Create profile for existing admin user
--    Guardado por EXISTS: só roda se esse usuário existir no auth.users deste
--    ambiente (no banco original do Lovable existia; em um banco novo é no-op).
INSERT INTO public.profiles (id, email, full_name, approved)
SELECT
  '083081cc-602c-4017-ae7f-a7867a4f91b1',
  'diegocaporusso@gmail.com',
  'Diego Caporusso',
  true
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '083081cc-602c-4017-ae7f-a7867a4f91b1'
)
ON CONFLICT (id) DO UPDATE SET approved = true;

-- 3. Ensure admin role exists for the user (mesmo guard)
INSERT INTO public.user_roles (user_id, role)
SELECT '083081cc-602c-4017-ae7f-a7867a4f91b1', 'admin'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '083081cc-602c-4017-ae7f-a7867a4f91b1'
)
ON CONFLICT DO NOTHING;