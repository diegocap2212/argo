-- ============================================================================
-- Rollback de 20260731130000_neo_authz_rpc.sql
--
-- Tira `/api/authz` do ar sem desmontar o RBAC: a função some, a function do portal passa a
-- receber erro do PostgREST e — porque ela é fail-closed — o Nero fecha. É a ordem certa: o
-- rollback de uma porta de autorização deve FECHAR a porta, nunca abri-la.
--
-- ⚠️ ANTES de rodar isto, o Nero em produção precisa ter voltado ao gate de senha
-- (`NERO_PASSWORD` + `/api/gate?scope=nero`), senão ninguém entra nele. Ver a ordem no
-- HANDOFF.md — reverter só o banco deixa o estado invertido, que foi a lição de 2026-07-27.
--
-- O segredo do Vault NÃO é apagado aqui de propósito: apagar segredo é operação manual e
-- irreversível, e um rollback que destrói credencial impede o roll-forward. Para tirá-lo:
--   select vault.delete_secret((select id from vault.secrets where name = 'neo_authz_secret'));
-- ============================================================================

begin;

drop function if exists public.neo_perms_for_email(text, text);

commit;
