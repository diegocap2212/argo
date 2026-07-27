-- ============================================================================
-- Cron das âncoras SEM credencial pública (achado P0.1 do review de 2026-07-27).
--
-- A migration 20260712190000 agendava o job com `Authorization: Bearer <anon jwt>`
-- HARDCODED no SQL versionado. A anon key é pública — vai no bundle do browser — então uma
-- chave pública era o gatilho de carga na API do Jira e de escrita privilegiada em
-- `anchor_readings` via `service_role`.
--
-- Agora o job chama `sync-anchors-cron` com uma secret EXCLUSIVA em header, lida do Vault.
-- Nada sensível fica no SQL versionado, e a função roda com `verify_jwt = false` (ver
-- supabase/config.toml) porque chamada service-to-service não tem usuário: o controle de
-- acesso é a secret, checada em tempo constante no handler.
--
-- PRÉ-REQUISITO OPERACIONAL — fazer ANTES de aplicar em produção (ver SECRETS.md):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/sync-anchors-cron',
--                              'anchor_sync_url');
--   select vault.create_secret('<secret longa e aleatória>', 'anchor_sync_secret');
-- E o MESMO valor na função:
--   supabase secrets set ANCHOR_SYNC_CRON_SECRET='<a mesma secret>'
--
-- Se qualquer um dos dois segredos faltar, o subselect devolve NULL, `net.http_post` falha e
-- o cron não roda — fail-closed, em vez de cair para um default que funcione.
--
-- A anon key exposta na migration antiga precisa ser ROTACIONADA: está no histórico do git.
-- ============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

do $$
begin
  -- Job antigo (que usava a anon key) sai de cena.
  if exists (select 1 from cron.job where jobname = 'sync-anchors-daily') then
    perform cron.unschedule('sync-anchors-daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'sync-anchors-cron-daily') then
    perform cron.unschedule('sync-anchors-cron-daily');
  end if;
end
$$;

-- 09:00 UTC ≈ 06:00 America/Sao_Paulo. Idempotente (reagenda se já existir).
select cron.schedule('sync-anchors-cron-daily', '0 9 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'anchor_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-anchor-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'anchor_sync_secret')
    ),
    body := '{}'::jsonb
  );
$job$);
