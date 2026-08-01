-- ============================================================================
-- Rollback de 20260731150000_fix_orfaos_view_rls.sql
--
-- ⚠️ REVERTER ISTO REABRE UM VAZAMENTO. A view volta a ser SECURITY DEFINER e a contornar a
-- policy `portal_roles_read`, expondo e-mail/papel/quem-concedeu de grants órfãos a qualquer
-- pessoa autenticada. Só faz sentido se a versão nova estiver quebrando a tela de Pessoas para
-- quem TEM permissão — e, nesse caso, o conserto certo é a policy de `profiles`, não voltar
-- para cá.
--
-- Restaura exatamente a definição de 20260727180000.
-- ============================================================================

begin;

drop view if exists public.v_portal_roles_orfaos;

create view public.v_portal_roles_orfaos as
  select pr.email, pr.role, pr.created_at, pr.granted_by
    from public.portal_roles pr
   where pr.revoked_at is null
     and pr.user_id is null
     and not exists (select 1 from auth.users u where lower(u.email) = pr.email);

commit;
