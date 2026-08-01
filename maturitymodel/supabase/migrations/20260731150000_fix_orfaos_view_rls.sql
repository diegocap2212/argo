-- ============================================================================
-- `v_portal_roles_orfaos` contornava a RLS. Dois ERROR do `supabase db advisors`.
--
-- COMO ISTO ACONTECEU: view em Postgres é **SECURITY DEFINER por padrão**. A de
-- `20260727180000` foi escrita como um `create view` comum, então ela roda com os privilégios
-- do DONO — e passa por cima da policy `portal_roles_read`, que exige `neo.roles.manage`.
-- Resultado: qualquer pessoa autenticada lia e-mail, papel, data e quem concedeu de todos os
-- grants órfãos. Além disso a view referenciava `auth.users`, o que o linter sinaliza como
-- exposição de dado de autenticação por view em schema publicado.
--
-- Nenhum dos dois foi notado na revisão nem nos testes: o harness de PGlite concede os
-- defaults do Supabase e não emula o comportamento de `security_invoker`, e o `pg_policies`
-- não enxerga views. Quem pegou foi o `db advisors`, rodado logo após aplicar em produção.
--
-- DUAS CORREÇÕES, e as duas são necessárias:
--
--   1. `security_invoker = true` — a view passa a rodar com os privilégios de QUEM CONSULTA,
--      então `portal_roles_read` volta a valer. Admin Geral e Admin leem (têm
--      `neo.roles.manage`); qualquer outra pessoa vê apenas a própria linha, que é o que a
--      policy sempre disse.
--
--   2. `auth.users` → `public.profiles`. São 1:1 (o trigger `handle_new_user` cria o profile no
--      signup), então a semântica é a mesma; a diferença é que `profiles` está em `public` e
--      TEM RLS, enquanto `auth.users` é schema de autenticação e não deveria ser alcançável por
--      view publicada. Com `security_invoker`, ler `auth.users` também simplesmente falharia
--      para `authenticated`, que não tem grant nela.
--
-- Quem precisa da view (Admin/Admin Geral) tem `neo.people.read_all`, então enxerga todos os
-- profiles e o `not exists` responde certo. Para quem não tem, a linha já estava fora pelo
-- filtro de `portal_roles` — não há caso em que a mudança produza um falso "órfão" para quem
-- tem permissão de ver a tela.
-- ============================================================================

begin;

create or replace view public.v_portal_roles_orfaos
  with (security_invoker = true)
as
  select pr.email, pr.role, pr.created_at, pr.granted_by
    from public.portal_roles pr
   where pr.revoked_at is null
     and pr.user_id is null
     and not exists (
       select 1 from public.profiles p where lower(p.email) = pr.email
     );

comment on view public.v_portal_roles_orfaos is
  'Grants concedidos a e-mail que nunca virou usuário (quase sempre e-mail digitado errado). '
  'security_invoker: respeita a RLS de portal_roles, então só quem tem neo.roles.manage vê '
  'além da própria linha. Não referencia auth.users de propósito — ver 20260731150000.';

commit;
