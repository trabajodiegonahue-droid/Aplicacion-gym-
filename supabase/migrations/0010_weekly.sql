-- =====================================================================
-- FUEGO JUNTOS · 0010 · Resumen semanal de la pareja
-- - public.week_summary(desde, hasta): XP y récords de la semana para
--   mí y mi pareja (solo totales).
-- - private.enqueue_weekly(): el domingo a las 19:00 (hora de cada uno)
--   manda el aviso "Su semana". Se ejecuta desde cron_tick.
-- =====================================================================

create or replace function public.week_summary(p_from date, p_to date)
returns table(user_id uuid, xp bigint, workouts bigint, activity_minutes bigint, water_ml bigint,
              habit_checks bigint, days_completed bigint, couple_days bigint, records bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  c uuid := private.my_couple();
  m uuid;
  t record;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'Rango no válido'; end if;
  for m in select auth.uid() where c is null union select x from private.members(c) x where c is not null loop
    select * into t from private.xp_parts(m, p_from, p_to);
    user_id := m; xp := t.xp; workouts := t.workouts; activity_minutes := t.activity_minutes; water_ml := t.water_ml;
    habit_checks := t.habit_checks; days_completed := t.days_completed; couple_days := t.couple_days;
    select count(*) into records from public.records r where r.user_id = m and r.achieved_on between p_from and p_to;
    return next;
  end loop;
end;
$$;
revoke execute on function public.week_summary(date, date) from public, anon;
grant execute on function public.week_summary(date, date) to authenticated;

create or replace function private.enqueue_weekly(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  pr record;
  lt timestamp;
  d date;
  c uuid;
  t record;
  pt record;
  n int := 0;
  body text;
begin
  for pr in select * from public.profiles loop
    lt := p_now at time zone private.user_tz(pr.id);
    -- domingo (dow = 0), entre 19:00 y 19:15
    if extract(dow from lt) <> 0 or not private.in_window(lt, '19:00', 15) then continue; end if;
    d := lt::date;
    c := private.active_couple(pr.id);
    select * into t from private.xp_parts(pr.id, d - 6, d);
    if c is not null and private.partner_of(pr.id) is not null then
      -- En pareja: siempre en equipo, nunca comparando
      select * into pt from private.xp_parts(private.partner_of(pr.id), d - 6, d);
      body := format('Juntos sumaron %s entrenos, %s min de actividad y +%s XP. Días que cumplieron los dos: %s. ¡Miren su semana! 💞',
                     t.workouts + pt.workouts, t.activity_minutes + pt.activity_minutes, t.xp + pt.xp, t.couple_days);
    else
      body := format('Esta semana: %s entrenos, %s min de actividad, +%s XP. ¡Mira tu resumen! 🔥', t.workouts, t.activity_minutes, t.xp);
    end if;
    perform private.notify(pr.id, 'weekly', '📊 Su semana en Gymaiego', body,
      jsonb_build_object('from', d - 6, 'to', d), 'weekly:' || d);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.enqueue_weekly(timestamptz) from public;

create or replace function private.cron_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.finalize_all(now());
  perform private.enqueue_reminders(now());
  perform private.expire_challenges();
  perform private.enqueue_weekly(now());
end;
$$;
