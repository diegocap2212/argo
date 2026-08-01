import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

/**
 * Permissões GLOBAIS da pessoa, via RPC `my_permissions()`.
 *
 * ⚠️ ESTE HOOK NÃO AUTORIZA NADA. Ele decide o que a tela MOSTRA. O enforcement é a RLS: um
 * cliente adulterado que forçasse `can('neo.matrix.manage')` continuaria recusado no `insert`.
 * A regra que vem do MMA vale aqui inteira — nunca renderizar formulário que a RLS vai negar,
 * porque o erro chega depois de a pessoa ter digitado.
 *
 * FAIL-CLOSED EM SILÊNCIO, de propósito: erro devolve lista vazia em vez de lançar. Lançar
 * transformaria uma indisponibilidade momentânea em tela de erro no app inteiro e, pior, um
 * `isError` mal tratado poderia ser lido como "ainda carregando" e liberar UI de administração.
 * Sem permissão, sem poder. É o mesmo raciocínio do `usePortalRole` do MMA.
 */
export function usePermissions() {
  const { user, loading } = useAuth();

  const query = useQuery({
    queryKey: ['my_permissions', user?.id],
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('my_permissions');
      if (error) {
        console.error('[usePermissions] my_permissions indisponível (fail-closed):', error);
        return [];
      }
      return Array.isArray(data) ? (data as string[]) : [];
    },
  });

  const perms = query.data ?? [];
  return {
    perms,
    can: (perm: string) => perms.includes(perm),
    /** `true` enquanto não se sabe. Quem usa isto mostra esqueleto, nunca conteúdo. */
    isLoading: loading || query.isLoading,
  };
}
