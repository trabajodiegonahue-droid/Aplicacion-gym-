-- =====================================================================
-- GYMAIEGO · 0016 · Entrenar en vivo, récords y recordatorios inteligentes
--  · live_sessions: lo que cada uno está entrenando AHORA (solo si lo comparte).
--    La pareja ve ejercicio, series hechas y descanso. Nunca kilos ni reps.
--  · live_reactions: 🔥💪❤️👏 que se mandan mientras entrenan.
--  · workout_records(): récords personales de un entreno (avisa a la pareja
--    SIN mostrar el peso).
--  · enqueue_smart(): avisa 2 h antes del cierre del día qué te falta, y si tu
--    pareja ya cumplió. Si tú cumpliste y a tu pareja le queda 1 h, te avisa.
-- =====================================================================

create table if not exists public.live_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null default 'Entrenamiento' check (char_length(title) between 1 and 80),
  exercise text check (char_length(exercise) <= 80),
  sets_done int not null default 0 check (sets_done between 0 and 500),
  sets_total int not null default 0 check (sets_total between 0 and 500),
  resting_until timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.live_sessions enable row level security;
grant select, insert, update, delete on public.live_sessions to authenticated;
drop policy if exists live_sessions_select on public.live_sessions;
create policy live_sessions_select on public.live_sessions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_partner(user_id));
drop policy if exists live_sessions_insert on public.live_sessions;
create policy live_sessions_insert on public.live_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = private.active_couple((select auth.uid())));
drop policy if exists live_sessions_update on public.live_sessions;
create policy live_sessions_update on public.live_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and couple_id = private.active_couple((select auth.uid())));
drop policy if exists live_sessions_delete on public.live_sessions;
create policy live_sessions_delete on public.live_sessions for delete to authenticated using (user_id = (select auth.uid()));

-- Al empezar (o volver a empezar) una sesión en vivo, avisar a la pareja (máx. 1 vez por hora)
create or replace function private.tg_live_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ended_at is null and (tg_op = 'INSERT' or old.ended_at is not null or old.started_at is distinct from new.started_at) then
    perform private.notify(private.partner_of(new.user_id), 'live',
      '🔴 ' || private.display_name(new.user_id) || ' está entrenando ahora',
      'Entra a mirarle y mándale un 🔥 para darle energía.',
      jsonb_build_object('user_id', new.user_id),
      'live:' || new.user_id || ':' || to_char(now(), 'YYYY-MM-DD-HH24'));
  end if;
  return new;
end;
$$;
drop trigger if exists tg_after on public.live_sessions;
create trigger tg_after after insert or update on public.live_sessions for each row execute function private.tg_live_after();

create table if not exists public.live_reactions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade default auth.uid(),
  to_user uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('🔥','💪','❤️','👏','😮','🚀')),
  created_at timestamptz not null default now()
);
create index if not exists live_reactions_to on public.live_reactions(to_user, created_at desc);
alter table public.live_reactions enable row level security;
grant select, insert on public.live_reactions to authenticated;
drop policy if exists live_reactions_select on public.live_reactions;
create policy live_reactions_select on public.live_reactions for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));
drop policy if exists live_reactions_insert on public.live_reactions;
create policy live_reactions_insert on public.live_reactions for insert to authenticated
  with check (from_user = (select auth.uid()) and private.is_partner(to_user) and couple_id = private.active_couple((select auth.uid())));

-- Máximo 30 reacciones por minuto (evita spam)
create or replace function private.tg_reaction_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.live_reactions where from_user = new.from_user and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Calma 😄 Demasiadas reacciones seguidas' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists tg_before on public.live_reactions;
create trigger tg_before before insert on public.live_reactions for each row execute function private.tg_reaction_before();

do $$
declare t text;
begin
  foreach t in array array['live_sessions','live_reactions'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when others then null; end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Récords personales de un entreno (comparado con todos los anteriores)
-- kind = 'peso' (más kilos), 'reps' (más reps sin peso) o 'tiempo' (más segundos)
-- ---------------------------------------------------------------------
create or replace function public.workout_records(p_workout uuid, p_announce boolean default false)
returns table(exercise_id uuid, exercise text, kind text, best numeric, previous numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  w record;
  names text;
  n int;
begin
  select * into w from public.workouts where id = p_workout and user_id = (select auth.uid());
  if not found then return; end if;
  return query
  with cur as (
    select s.exercise_id,
           max(s.weight_kg) filter (where s.weight_kg > 0 and coalesce(s.reps, 1) > 0) as kg,
           max(s.reps) filter (where coalesce(s.weight_kg, 0) = 0) as reps,
           max(s.duration_sec) filter (where coalesce(s.weight_kg, 0) = 0) as secs
      from public.workout_sets s where s.workout_id = w.id group by s.exercise_id
  ), prev as (
    select s.exercise_id,
           max(s.weight_kg) filter (where s.weight_kg > 0 and coalesce(s.reps, 1) > 0) as kg,
           max(s.reps) filter (where coalesce(s.weight_kg, 0) = 0) as reps,
           max(s.duration_sec) filter (where coalesce(s.weight_kg, 0) = 0) as secs
      from public.workout_sets s join public.workouts ww on ww.id = s.workout_id
     where ww.user_id = w.user_id and ww.id <> w.id and (ww.performed_at < w.performed_at or (ww.performed_at = w.performed_at and ww.created_at < w.created_at))
     group by s.exercise_id
  )
  select c.exercise_id, e.name::text,
         case when c.kg > p.kg then 'peso' when c.reps > p.reps then 'reps' else 'tiempo' end,
         case when c.kg > p.kg then c.kg when c.reps > p.reps then c.reps::numeric else c.secs::numeric end,
         case when c.kg > p.kg then p.kg when c.reps > p.reps then p.reps::numeric else p.secs::numeric end
    from cur c join prev p on p.exercise_id = c.exercise_id
    join public.exercises e on e.id = c.exercise_id
   where c.kg > p.kg or (c.kg is null and (c.reps > p.reps or c.secs > p.secs));

  if p_announce then
    select string_agg(distinct e.name, ', '), count(distinct e.id) into names, n
      from public.workout_records(p_workout, false) r join public.exercises e on e.id = r.exercise_id;
    if n > 0 then
      perform private.notify(private.partner_of(w.user_id), 'records',
        '🏆 ' || private.display_name(w.user_id) || (case when n = 1 then ' batió un récord' else ' batió ' || n || ' récords' end),
        'En ' || names || '. ¡Mándale un aplauso! 👏',
        jsonb_build_object('workout_id', w.id, 'user_id', w.user_id), 'pr:' || w.id);
    end if;
  end if;
end;
$$;
revoke execute on function public.workout_records(uuid, boolean) from public, anon;
grant execute on function public.workout_records(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Recordatorios inteligentes (según la hora de cierre del día de cada uno)
-- ---------------------------------------------------------------------
create or replace function private.missing_text(d jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(string_agg(case x
      when 'workout' then 'un entreno' when 'activity' then 'actividad' when 'steps' then 'pasos'
      when 'water' then 'agua' when 'habits' then 'hábitos' else x end,
      case when d->>'require' = 'all' then ' + ' else ' o ' end), 'algo de actividad')
    from jsonb_array_elements_text(coalesce(d->'required', '[]'::jsonb)) x
   where not (coalesce(d->'met', '[]'::jsonb) ? x);
$$;

create or replace function private.enqueue_smart(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  me record;
  pa record;
  n int := 0;
  ends timestamptz;
  pname text;
  pid uuid;
  d1 date;
  d2 date;
begin
  for r in
    select cm.couple_id, cm.user_id, p.notification_prefs as prefs
      from public.couple_members cm join public.couples c on c.id = cm.couple_id and c.status = 'active'
      join public.profiles p on p.id = cm.user_id
     where cm.left_at is null
  loop
    if private.pref(r.prefs, 'smart', 'enabled', 'true') = 'false' then continue; end if;
    -- se calcula en el momento (aunque hoy no haya registrado nada todavía)
    d1 := private.local_day_for(r.user_id, p_now);
    select x.status, x.details into me from private.compute_member(r.couple_id, r.user_id, d1, p_now) x;
    pid := private.partner_of(r.user_id);
    if pid is null then continue; end if;
    d2 := private.local_day_for(pid, p_now);
    select x.status, x.details into pa from private.compute_member(r.couple_id, pid, d2, p_now) x;
    pname := private.display_name(private.partner_of(r.user_id));

    -- A mí me faltan 2 horas
    ends := (me.details->>'day_end')::timestamptz;
    if ends is not null and me.status in ('pending','in_progress')
       and p_now >= ends - interval '2 hours' and p_now < ends - interval '1 hour 40 minutes' then
      perform private.notify(r.user_id, 'smart',
        case when pa.status = 'completed' then '⏳ ' || pname || ' ya cumplió, ¡te toca!' else '⏳ Te quedan 2 horas para tu día' end,
        'Te falta: ' || private.missing_text(me.details) || '. Con eso suman a la racha 🔥',
        jsonb_build_object('day', d1), 'smart:' || r.user_id || ':' || d1);
      n := n + 1;
    end if;

    -- Yo cumplí y a mi pareja le queda 1 hora
    ends := (pa.details->>'day_end')::timestamptz;
    if ends is not null and me.status in ('completed','rest','paused') and pa.status in ('pending','in_progress')
       and p_now >= ends - interval '1 hour' and p_now < ends - interval '40 minutes' then
      perform private.notify(r.user_id, 'smart',
        '💌 A ' || pname || ' le queda 1 hora',
        'Le falta: ' || private.missing_text(pa.details) || '. Un mensaje tuyo puede salvar la racha.',
        jsonb_build_object('day', d2, 'user_id', pid), 'smart_partner:' || r.user_id || ':' || d2);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function private.enqueue_smart(timestamptz) from public;
revoke execute on function private.missing_text(jsonb) from public;

create or replace function private.cron_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.finalize_all(now());
  perform private.enqueue_reminders(now());
  perform private.expire_challenges();
  perform private.enqueue_weekly(now());
  perform private.enqueue_cycle(now());
  perform private.enqueue_smart(now());
  -- sesiones en vivo abandonadas (app cerrada sin terminar)
  update public.live_sessions set ended_at = updated_at where ended_at is null and updated_at < now() - interval '30 minutes';
end;
$$;
