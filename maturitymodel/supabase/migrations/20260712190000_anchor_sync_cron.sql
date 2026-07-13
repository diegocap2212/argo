-- ============================================================================
-- Cron de sincronização das âncoras: chama a Edge Function sync-anchors 1x/dia.
-- Usa pg_cron (agendador) + pg_net (HTTP). A anon key é pública (protegida por
-- RLS); a função faz o trabalho com service_role internamente.
-- 09:00 UTC ≈ 06:00 America/Sao_Paulo. Idempotente (reagenda se já existir).
-- ============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-anchors-daily') then
    perform cron.unschedule('sync-anchors-daily');
  end if;
end
$$;

select cron.schedule('sync-anchors-daily', '0 9 * * *', $job$
  select net.http_post(
    url := 'https://cvkcngrmnfwupstyrpsd.supabase.co/functions/v1/sync-anchors',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a2NuZ3JtbmZ3dXBzdHlycHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjE5MDQsImV4cCI6MjA5NzI5NzkwNH0.0PwK2Lv6M7zm0axRRxkurdP3lrR8cXaTSxoglsul9M8'),
    body := '{}'::jsonb
  );
$job$);
