-- ============================================================================
-- Autorização da sincronização de âncoras (achado P0.1 do review de 2026-07-27).
--
-- O QUE ESTAVA ERRADO:
--   A Edge Function `sync-anchors` não fazia autorização NENHUMA. Não checava `auth.uid()`,
--   nem papel, nem se a pessoa pertencia ao squad. Aceitava body vazio e, nesse caso,
--   sincronizava todos os squads mapeados. Aceitava qualquer `team_id`. E gravava com
--   `SB_SERVICE_ROLE`, contornando RLS. `verify_jwt` não cobre isso: ele prova que o token é
--   assinado, e a anon key — que é PÚBLICA — também é um token assinado válido.
--
-- Esta migration cria a decisão de autorização NO BANCO, reusando os MESMOS helpers das
-- policies (`is_sm`, `is_portal_am`). Uma segunda cópia da matriz de papéis em TypeScript
-- divergiria da RLS na primeira mudança de regra.
--
-- O reagendamento do cron está SEPARADO em 20260727130100 porque depende de pg_cron/pg_net/
-- vault, que não existem no PGlite. Assim esta parte — a que decide quem pode escrever —
-- roda e é verificada pelo harness de RLS (tests/rls/rls-matrix.ts).
-- ============================================================================
begin;

-- SM daquele squad, ou AM/admin global (`is_portal_am` já inclui admin).
-- SECURITY DEFINER porque os helpers leem tabelas que o usuário comum não enxerga direto;
-- `search_path` fixo para a função não ser sequestrável por schema no path.
create or replace function public.can_sync_anchors(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_sm(p_team), false) or coalesce(public.is_portal_am(), false);
$$;

comment on function public.can_sync_anchors(uuid) is
  'Autorização da Edge Function sync-anchors-user: SM do squad, ou AM/admin global. '
  'Chamada COM o JWT do usuário, para auth.uid() dentro dela ser a pessoa.';

-- `anon` NÃO executa: a anon key é pública e não representa pessoa nenhuma.
-- Os DOIS revokes são necessários. O bootstrap do Supabase roda
-- `grant all on all routines in schema public to anon, authenticated, service_role`, que é um
-- grant EXPLÍCITO ao papel `anon` — revogar só de PUBLIC não o alcança.
revoke all on function public.can_sync_anchors(uuid) from public;
revoke all on function public.can_sync_anchors(uuid) from anon;
grant execute on function public.can_sync_anchors(uuid) to authenticated;

commit;
