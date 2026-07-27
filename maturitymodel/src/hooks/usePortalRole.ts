import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { devWarn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { PortalRole } from "@/types/mma";

/**
 * Papéis GLOBAIS do usuário no portal, via RPC `my_portal_roles()`.
 *
 * Um RPC só (e não um por papel) porque a home precisa dos dois na primeira
 * renderização: é o papel que decide QUAIS SEÇÕES existem, então dois requests
 * assíncronos fariam a tela pular de "SM" para "AM" na frente do usuário.
 *
 * ⚠️ O enforcement real é a RLS — este hook só decide o que a UI mostra. Um cliente
 * modificado que forçasse `isAdmin` continuaria barrado no banco.
 */
export function usePortalRole() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["portal-roles", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PortalRole[]> => {
      const { data, error } = await supabase.rpc("my_portal_roles");
      if (error) {
        /**
         * ESTE hook é a exceção deliberada: NÃO lança.
         *
         * Ele decide se a pessoa tem papel GLOBAL (admin/am). Lançar aqui transformaria uma
         * indisponibilidade momentânea em tela de erro no portal inteiro — e, pior, um
         * `isError` mal tratado em algum consumidor poderia ser lido como "ainda carregando"
         * e liberar UI de admin. Lista vazia é fail-closed: sem papel, sem poder.
         *
         * O que muda em relação ao original: `console.error` no lugar de `devWarn`, que era
         * NO-OP em produção — o erro sumia exatamente onde a informação importa.
         */
        console.error("[usePortalRole] my_portal_roles indisponível (fail-closed, sem papel):", error);
        return [];
      }
      return (data ?? []) as PortalRole[];
    },
  });

  const roles = query.data ?? [];
  const isAdmin = roles.includes("admin");

  return {
    roles,
    isAdmin,
    // Admin faz tudo, inclusive homologar — espelha is_portal_am() no banco.
    isAM: isAdmin || roles.includes("am"),
    isLoading: query.isLoading,
  };
}
