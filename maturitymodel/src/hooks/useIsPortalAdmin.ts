import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Admin global do portal (Diego + backup), vinculado ao e-mail de login via RPC
 * is_portal_admin(). O enforcement real é a RLS — este hook só decide o que a UI mostra.
 */
export function useIsPortalAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-portal-admin", user?.id],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_portal_admin");
      if (error) return false;
      return data === true;
    },
  });
}
