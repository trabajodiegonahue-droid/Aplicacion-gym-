-- =====================================================================
-- FUEGO JUNTOS · 0006 · Niveles y experiencia (XP)
-- La XP se calcula SIEMPRE en el servidor a partir de los registros.
--   Entrenamiento ........ 40 XP     Hábito marcado ....... 10 XP
--   Minuto de actividad ..  1 XP     Día propio cumplido .. 25 XP
--   Cada 50 ml de agua ...  1 XP     Día de racha en pareja 15 XP
-- Nivel L se alcanza con 50·L·(L−1) XP (1→0, 2→100, 3→300, 5→1000, 10→4500…)
-- =====================================================================

create or replace function private.xp_parts(p_uid uuid, p_from date, p_to date,
  out workouts bigint, out activity_minutes bigint, out water_ml bigint, out habit_checks bigint,
  out days_completed bigint, out couple_days bigint, out xp bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  select count(*) into workouts from public.workouts w where w.user_id = p_uid and w.local_day between p_from and p_to;
  select coalesce(sum(a.minutes), 0) into activity_minutes from public.activity_logs a where a.user_id = p_uid and a.local_day between p_from and p_to;
  select greatest(coalesce(sum(wl.amount_ml), 0), 0) into water_ml from public.water_logs wl where wl.user_id = p_uid and wl.local_day between p_from and p_to;
  select count(*) into habit_checks from public.habit_logs hl where hl.user_id = p_uid and hl.local_day between p_from and p_to;
  select count(*) into days_completed from public.member_day_status m where m.user_id = p_uid and m.status = 'completed' and m.day between p_from and p_to;
  select count(*) into couple_days from public.streak_days sd
    join public.couple_members cm on cm.couple_id = sd.couple_id and cm.user_id = p_uid
    where sd.status = 'completed' and sd.day between p_from and p_to;
  xp := workouts * 40 + activity_minutes + water_ml / 50 + habit_checks * 10 + days_completed * 25 + couple_days * 15;
end;
$$;

-- XP total y de hoy para mí y mi pareja (solo totales, nunca registros en bruto)
create or replace function public.member_levels()
returns table(user_id uuid, xp bigint, xp_today bigint, workouts bigint, activity_minutes bigint,
              water_ml bigint, habit_checks bigint, days_completed bigint, couple_days bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  c uuid := private.my_couple();
  m uuid;
  t record;
  td record;
  d date;
begin
  for m in select auth.uid() where c is null union select x from private.members(c) x where c is not null loop
    d := private.user_today(m);
    select * into t from private.xp_parts(m, '2000-01-01', '2100-01-01');
    select * into td from private.xp_parts(m, d, d);
    user_id := m; xp := t.xp; xp_today := td.xp;
    workouts := t.workouts; activity_minutes := t.activity_minutes; water_ml := t.water_ml;
    habit_checks := t.habit_checks; days_completed := t.days_completed; couple_days := t.couple_days;
    return next;
  end loop;
end;
$$;

revoke execute on function private.xp_parts(uuid, date, date) from public;
revoke execute on function public.member_levels() from public, anon;
grant execute on function public.member_levels() to authenticated;
