-- =====================================================================
-- FUEGO JUNTOS · 0005 · Tareas programadas (gratis en Supabase Free)
-- pg_cron: cierra días vencidos de la racha y genera recordatorios cada 15 min.
-- pg_net:  permite avisar a /api/push (Vercel) para enviar notificaciones push.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fuego-tick') then
    perform cron.unschedule('fuego-tick');
  end if;
  perform cron.schedule('fuego-tick', '*/15 * * * *', 'select private.cron_tick()');
end $$;
