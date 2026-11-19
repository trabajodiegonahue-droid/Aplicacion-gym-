-- =====================================================================
-- GYMAIEGO · 0017 · Notificaciones push "como WhatsApp"
--  · push_status(): dice si el servidor de push está configurado y cuántos
--    teléfonos tuyos están registrados (para el diagnóstico en Perfil).
--  · send_test_push(): te manda a ti mismo una notificación de prueba.
-- =====================================================================

create or replace function public.push_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server', exists (select 1 from private.app_settings where key = 'push_url' and coalesce(value, '') <> '')
              and exists (select 1 from private.app_settings where key = 'push_secret' and coalesce(value, '') <> ''),
    'devices', (select count(*) from public.push_subscriptions where user_id = (select auth.uid())),
    'net', exists (select 1 from pg_extension where extname = 'pg_net'));
$$;
revoke execute on function public.push_status() from public, anon;
grant execute on function public.push_status() to authenticated;

create or replace function public.send_test_push()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Inicia sesión' using errcode = '28000'; end if;
  -- máximo 1 por minuto
  insert into public.notifications(user_id, kind, title, body, dedupe_key)
  values (me, 'test', '🔔 ¡Así se ven los avisos de Gymaiego!',
          'Como WhatsApp: en la pantalla bloqueada y en el centro de notificaciones 💪',
          'test:' || to_char(now(), 'YYYYMMDDHH24MI'))
  on conflict (user_id, dedupe_key) do nothing;
  return public.push_status();
end;
$$;
revoke execute on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
