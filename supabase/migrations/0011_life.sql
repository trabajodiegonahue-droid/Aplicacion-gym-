-- =====================================================================
-- FUEGO JUNTOS · 0011 · La vida real: pausas, días de mínimos, lesiones,
-- "cómo me siento", entreno juntos, planes, medidas, fotos privadas,
-- ciclo (opcional y privado) y calendario de la pareja.
-- Nada de esto cambia el historial: solo afecta días que todavía no cerraron
-- y siempre con registros creados ANTES del cierre del día.
-- =====================================================================

-- Nuevo estado "en pausa" (congela el día: no suma ni rompe la racha)
alter table public.member_day_status drop constraint if exists member_day_status_status_check;
alter table public.member_day_status add constraint member_day_status_status_check
  check (status in ('pending','in_progress','completed','rest','missed','paused'));
alter table public.streak_days drop constraint if exists streak_days_status_check;
alter table public.streak_days add constraint streak_days_status_check
  check (status in ('pending','in_progress','completed','rest','missed','recovered','paused'));

-- Eventos del calendario: varios días, de quién es y "día suave"
alter table public.calendar_events add column if not exists end_date date;
alter table public.calendar_events add column if not exists for_user uuid references auth.users(id) on delete set null;
alter table public.calendar_events add column if not exists lighten boolean not null default false;
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check
  check (kind in ('evento','aniversario','cumpleanos','reto','meta','fecha','visita','entrenamiento','examen','trabajo','viaje','salud'));
alter table public.calendar_events drop constraint if exists calendar_events_end_check;
alter table public.calendar_events add constraint calendar_events_end_check check (end_date is null or (end_date >= event_date and end_date <= event_date + 31));

create or replace function private.tg_event_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  if new.for_user is not null and not exists (select 1 from public.couple_members cm where cm.couple_id = new.couple_id and cm.user_id = new.for_user and cm.left_at is null) then
    raise exception 'Esa persona no es parte de la pareja';
  end if;
  return new;
end;
$$;
drop trigger if exists tg_before on public.calendar_events;
create trigger tg_before before insert or update on public.calendar_events for each row execute function private.tg_event_before();

-- ---------------------------------------------------------------------
-- Pausas: enfermedad, lesión, viaje u otro. Las activa cada uno para sí.
-- ---------------------------------------------------------------------
create table if not exists public.pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('enfermedad','lesion','viaje','otro')),
  start_date date not null,
  end_date date,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists pauses_user on public.pauses(user_id, start_date desc);

create or replace function private.tg_pause_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare today date := private.user_today(coalesce(new.user_id, old.user_id));
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.start_date < today then raise exception 'Una pausa no puede empezar en un día pasado'; end if;
    if new.start_date > today + 60 then raise exception 'Máximo 60 días por adelantado'; end if;
    if exists (select 1 from public.pauses p where p.user_id = new.user_id and (p.end_date is null or p.end_date >= new.start_date)
               and (new.end_date is null or p.start_date <= new.end_date)) then
      raise exception 'Ya tienes una pausa en esas fechas';
    end if;
  elsif tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.created_at := old.created_at; new.start_date := old.start_date; new.kind := old.kind;
    -- solo se puede terminar hoy o más adelante (nunca cambia días pasados)
    if new.end_date is distinct from old.end_date and new.end_date is not null and new.end_date < greatest(today, old.start_date) then
      raise exception 'La pausa solo puede terminar hoy o más adelante';
    end if;
    if old.end_date is not null and old.end_date < today then raise exception 'Esa pausa ya terminó'; end if;
  else
    if old.start_date < today then raise exception 'Una pausa ya empezada no se borra: termínala hoy'; end if;
    return old;
  end if;
  return new;
end;
$$;
create or replace function private.tg_pause_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid := coalesce(new.user_id, old.user_id);
  label text := case coalesce(new.kind, old.kind) when 'enfermedad' then 'por enfermedad 🤒' when 'lesion' then 'por una lesión 🩹' when 'viaje' then 'por un viaje ✈️' else '🌙' end;
begin
  perform private.refresh_member_day(u, private.user_today(u));
  if tg_op = 'INSERT' then
    perform private.notify(private.partner_of(u), 'partner_activity', private.display_name(u) || ' activó una pausa ' || label,
      'La racha queda congelada esos días. ¡Mándale cariño! 💞', jsonb_build_object('pause_id', new.id), 'pause:' || new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists tg_before on public.pauses;
create trigger tg_before before insert or update or delete on public.pauses for each row execute function private.tg_pause_before();
drop trigger if exists tg_after on public.pauses;
create trigger tg_after after insert or update or delete on public.pauses for each row execute function private.tg_pause_after();

-- ---------------------------------------------------------------------
-- Días de mínimos: con X minutos de algo, el día cuenta (cupo por mes)
-- ---------------------------------------------------------------------
create table if not exists public.easy_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  reason text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create or replace function private.tg_easy_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  today date;
  c uuid;
  r record;
  used int;
begin
  if tg_op = 'UPDATE' then raise exception 'Los días de mínimos no se editan'; end if;
  if tg_op = 'DELETE' then
    if old.day < private.user_today(old.user_id) then raise exception 'No puedes quitar un día de mínimos pasado'; end if;
    return old;
  end if;
  today := private.user_today(new.user_id);
  c := private.active_couple(new.user_id);
  new.created_at := now();
  if new.day < today then raise exception 'No puedes marcar un día pasado'; end if;
  if new.day > today + 30 then raise exception 'Máximo 30 días por adelantado'; end if;
  select * into r from private.rules_for(c, new.day);
  select count(*) into used from public.easy_days e where e.user_id = new.user_id and date_trunc('month', e.day) = date_trunc('month', new.day::timestamp);
  if used >= coalesce((r.rules->>'easy_days_per_month')::int, 4) then
    raise exception 'Ya usaste tus % días de mínimos de este mes', coalesce((r.rules->>'easy_days_per_month')::int, 4);
  end if;
  return new;
end;
$$;
drop trigger if exists tg_before on public.easy_days;
create trigger tg_before before insert or update or delete on public.easy_days for each row execute function private.tg_easy_before();
drop trigger if exists tg_after on public.easy_days;
create trigger tg_after after insert or delete on public.easy_days for each row execute function private.tg_log_after();

-- ---------------------------------------------------------------------
-- Cómo me siento hoy (energía, ánimo, sueño, dolor, estrés)
-- ---------------------------------------------------------------------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  energy smallint check (energy between 1 and 5),
  mood smallint check (mood between 1 and 5),
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 16),
  pain smallint check (pain between 0 and 5),
  stress smallint check (stress between 1 and 5),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create or replace function private.tg_checkin_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare today date := private.user_today(new.user_id);
begin
  if tg_op = 'UPDATE' then new.user_id := old.user_id; new.day := old.day; new.created_at := old.created_at; else new.created_at := now(); end if;
  new.updated_at := now();
  if new.day > today or new.day < today - 3 then raise exception 'Solo puedes registrar hoy o los últimos 3 días'; end if;
  return new;
end;
$$;
create or replace function private.tg_checkin_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.energy is not null and new.energy <= 2 and new.day = private.user_today(new.user_id) then
    perform private.notify(private.partner_of(new.user_id), 'partner_activity',
      private.display_name(new.user_id) || ' tiene poca energía hoy 😴', 'Un mensajito tuyo puede cambiarle el día 💞',
      jsonb_build_object('day', new.day), 'lowenergy:' || new.user_id || ':' || new.day);
  end if;
  return null;
end;
$$;
drop trigger if exists tg_before on public.checkins;
create trigger tg_before before insert or update on public.checkins for each row execute function private.tg_checkin_before();
drop trigger if exists tg_after on public.checkins;
create trigger tg_after after insert or update on public.checkins for each row execute function private.tg_checkin_after();

-- ---------------------------------------------------------------------
-- Lesiones y molestias
-- ---------------------------------------------------------------------
create table if not exists public.injuries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  area text not null check (area in ('hombro','codo','muneca','cuello','espalda_alta','espalda_baja','cadera','rodilla','tobillo','isquios','gemelo','pecho','abdomen','otro')),
  side text not null default 'na' check (side in ('izq','der','ambos','na')),
  severity smallint not null default 1 check (severity between 1 and 3),
  note text check (char_length(note) <= 200),
  started_on date not null default current_date,
  resolved_on date,
  created_at timestamptz not null default now(),
  check (resolved_on is null or resolved_on >= started_on)
);
create or replace function private.tg_injury_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(private.partner_of(new.user_id), 'partner_activity',
    private.display_name(new.user_id) || ' registró una molestia 🩹', 'Ánimo y paciencia: lo importante es recuperarse bien.',
    jsonb_build_object('injury_id', new.id), 'injury:' || new.id);
  return null;
end;
$$;
drop trigger if exists tg_after on public.injuries;
create trigger tg_after after insert on public.injuries for each row execute function private.tg_injury_after();

-- ---------------------------------------------------------------------
-- Planes de la semana (qué piensa hacer cada uno cada día)
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  kind text not null default 'gym' check (kind in ('gym','cardio','actividad','descanso','juntos','otro')),
  title text check (char_length(title) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists plans_user_day on public.plans(user_id, day);

-- ---------------------------------------------------------------------
-- Medidas corporales y fotos de progreso (SOLO las ve su dueño)
-- ---------------------------------------------------------------------
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null default current_date,
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  hip_cm numeric(5,1) check (hip_cm between 30 and 250),
  chest_cm numeric(5,1) check (chest_cm between 30 and 250),
  arm_cm numeric(5,1) check (arm_cm between 10 and 100),
  thigh_cm numeric(5,1) check (thigh_cm between 20 and 150),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null default current_date,
  path text not null,
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  check (path like 'private/' || user_id::text || '/%')
);

-- ---------------------------------------------------------------------
-- Ciclo menstrual (opcional, privado; compartir la FASE es opcional)
-- ---------------------------------------------------------------------
create table if not exists public.cycle_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  enabled boolean not null default false,
  share_phase boolean not null default false,
  cycle_length smallint not null default 28 check (cycle_length between 20 and 45),
  period_length smallint not null default 5 check (period_length between 2 and 10)
);
create table if not exists public.cycle_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or (end_date >= start_date and end_date <= start_date + 15))
);

create or replace function private.cycle_phase(p_uid uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; last date; dd int;
begin
  select * into s from public.cycle_settings where user_id = p_uid;
  if s is null or not s.enabled then return null; end if;
  select max(start_date) into last from public.cycle_periods where user_id = p_uid and start_date <= p_day;
  if last is null then return null; end if;
  dd := ((p_day - last) % s.cycle_length) + 1;
  return jsonb_build_object('day', dd, 'length', s.cycle_length, 'phase',
    case when dd <= s.period_length then 'menstrual'
         when dd <= s.cycle_length / 2 - 2 then 'folicular'
         when dd <= s.cycle_length / 2 + 1 then 'ovulatoria'
         else 'lutea' end);
end;
$$;

-- Fase de mi pareja (solo si ella/él decidió compartirla)
create or replace function public.partner_cycle()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p uuid := private.partner_of(auth.uid());
begin
  if p is null or not exists (select 1 from public.cycle_settings where user_id = p and enabled and share_phase) then return null; end if;
  return private.cycle_phase(p, private.user_today(p));
end;
$$;

create or replace function public.my_cycle()
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.cycle_phase(auth.uid(), private.user_today(auth.uid()));
$$;

-- ---------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- las ve su dueño y su pareja; solo el dueño las modifica
  foreach t in array array['pauses','easy_days','checkins','injuries','plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()) or private.is_partner(user_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete', t);
  end loop;
  -- privadas: SOLO su dueño
  foreach t in array array['measurements','progress_photos','cycle_settings','cycle_periods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Entreno juntos: uno lo registra, el otro lo CONFIRMA (nadie registra por el otro)
-- ---------------------------------------------------------------------
alter table public.workouts add column if not exists joint_with uuid references auth.users(id) on delete set null;
alter table public.workouts add column if not exists joint_of uuid references public.workouts(id) on delete set null;

create or replace function private.tg_workout_joint()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.joint_with is not null and new.joint_with is distinct from private.partner_of(new.user_id) then
    raise exception 'Solo puedes entrenar "juntos" con tu pareja';
  end if;
  if new.joint_of is not null and (tg_op = 'INSERT' or new.joint_of is distinct from old.joint_of)
     and coalesce(current_setting('fj.joint', true), '') <> '1' then
    raise exception 'Los entrenos juntos se confirman desde la invitación';
  end if;
  return new;
end;
$$;
drop trigger if exists tg_joint on public.workouts;
create trigger tg_joint before insert or update on public.workouts for each row execute function private.tg_workout_joint();

create or replace function private.tg_workout_joint_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.joint_with is not null and (tg_op = 'INSERT' or old.joint_with is distinct from new.joint_with) then
    perform private.notify(new.joint_with, 'couple', '💞 ' || private.display_name(new.user_id) || ' registró un entreno juntos',
      'Confírmalo para que cuente también para ti: ' || new.title, jsonb_build_object('joint_workout', new.id), 'joint:' || new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists tg_joint_after on public.workouts;
create trigger tg_joint_after after insert or update on public.workouts for each row execute function private.tg_workout_joint_after();

create or replace function public.pending_joint_workouts()
returns table(id uuid, title text, performed_at timestamptz, duration_min int, from_name text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.title, w.performed_at, w.duration_min, private.display_name(w.user_id)
  from public.workouts w
  where w.joint_with = auth.uid() and w.user_id = private.partner_of(auth.uid())
    and w.local_day >= private.user_today(auth.uid()) - 1
    and not exists (select 1 from public.workouts c where c.joint_of = w.id and c.user_id = auth.uid())
  order by w.performed_at desc;
$$;

create or replace function public.confirm_joint_workout(p_workout uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare w record; nid uuid; me uuid := auth.uid();
begin
  select * into w from public.workouts where id = p_workout;
  if w is null or w.joint_with is distinct from me or w.user_id is distinct from private.partner_of(me) then
    raise exception 'Invitación no válida';
  end if;
  if w.local_day < private.user_today(me) - 1 then raise exception 'Esa invitación ya venció'; end if;
  if exists (select 1 from public.workouts c where c.joint_of = w.id and c.user_id = me) then raise exception 'Ya lo confirmaste'; end if;
  perform set_config('fj.joint', '1', true);
  insert into public.workouts(user_id, title, performed_at, duration_min, notes, joint_with, joint_of)
  values (me, w.title, least(w.performed_at, now()), w.duration_min, 'Entreno juntos 💞', w.user_id, w.id) returning id into nid;
  perform set_config('fj.joint', '', true);
  perform private.notify(w.user_id, 'couple', '💞 ' || private.display_name(me) || ' confirmó el entreno juntos',
    '¡Cuenta para los dos! +20 XP extra para cada uno.', jsonb_build_object('workout', nid), 'jointok:' || w.id);
  return nid;
end;
$$;

-- ---------------------------------------------------------------------
-- Calendario de la pareja: todo lo de los dos en un rango de fechas.
-- Devuelve RESÚMENES (títulos y minutos), nunca series ni pesos.
-- ---------------------------------------------------------------------
create or replace function public.couple_calendar(p_from date, p_to date)
returns table(day date, user_id uuid, kind text, title text, info jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare c uuid := private.my_couple(); me uuid := auth.uid();
begin
  if me is null then raise exception 'Sin sesión'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Rango no válido'; end if;
  return query
  with mem as (select me u where c is null union select x from private.members(c) x where c is not null),
  days as (select generate_series(p_from, p_to, interval '1 day')::date d)
  select w.local_day, w.user_id, 'workout'::text, w.title,
         jsonb_build_object('minutes', w.duration_min, 'joint', w.joint_with is not null or w.joint_of is not null)
    from public.workouts w join mem on mem.u = w.user_id where w.local_day between p_from and p_to
  union all
  select a.local_day, a.user_id, 'activity', a.kind, jsonb_build_object('minutes', a.minutes, 'steps', a.steps)
    from public.activity_logs a join mem on mem.u = a.user_id where a.local_day between p_from and p_to
  union all
  select r.day, r.user_id, 'rest', 'Descanso', '{}'::jsonb from public.rest_days r join mem on mem.u = r.user_id where r.day between p_from and p_to
  union all
  select e.day, e.user_id, 'easy', 'Día de mínimos', jsonb_build_object('reason', e.reason) from public.easy_days e join mem on mem.u = e.user_id where e.day between p_from and p_to
  union all
  select days.d, p.user_id, 'pause', p.kind, jsonb_build_object('note', p.note, 'id', p.id)
    from public.pauses p join mem on mem.u = p.user_id join days on days.d between p.start_date and coalesce(p.end_date, greatest(p_to, p.start_date))
  union all
  select k.day, k.user_id, 'checkin', 'Cómo se siente', jsonb_build_object('energy', k.energy, 'mood', k.mood, 'sleep', k.sleep_hours, 'pain', k.pain)
    from public.checkins k join mem on mem.u = k.user_id where k.day between p_from and p_to
  union all
  select days.d, i.user_id, 'injury', i.area, jsonb_build_object('side', i.side, 'severity', i.severity, 'start', i.started_on = days.d)
    from public.injuries i join mem on mem.u = i.user_id join days on days.d between i.started_on and coalesce(i.resolved_on, greatest(p_to, i.started_on))
  union all
  select pl.day, pl.user_id, 'plan', coalesce(pl.title, pl.kind), jsonb_build_object('kind', pl.kind, 'id', pl.id)
    from public.plans pl join mem on mem.u = pl.user_id where pl.day between p_from and p_to
  union all
  select days.d, ev.created_by, 'event', ev.title,
         jsonb_build_object('id', ev.id, 'kind', ev.kind, 'time', ev.event_time, 'notes', ev.notes, 'for_user', ev.for_user, 'lighten', ev.lighten, 'yearly', ev.yearly)
    from public.calendar_events ev join days on (
      (not ev.yearly and days.d between ev.event_date and coalesce(ev.end_date, ev.event_date))
      or (ev.yearly and to_char(days.d, 'MM-DD') = to_char(ev.event_date, 'MM-DD') and days.d >= ev.event_date))
    where ev.couple_id = c
  union all
  select m.day, m.user_id, 'status', m.status, jsonb_build_object('easy', m.details->'is_easy', 'paused', m.details->'is_paused')
    from public.member_day_status m where m.couple_id = c and m.day between p_from and p_to
  union all
  select s.day, null::uuid, 'couple', s.status, '{}'::jsonb from public.streak_days s where s.couple_id = c and s.day between p_from and p_to
  union all
  select days.d, me, 'cycle', (private.cycle_phase(me, days.d))->>'phase', private.cycle_phase(me, days.d)
    from days where exists (select 1 from public.cycle_settings cs where cs.user_id = me and cs.enabled)
      and private.cycle_phase(me, days.d) is not null;
end;
$$;


-- ---------------------------------------------------------------------
-- Datos corporales semanales: peso + estatura en cada pesaje, y objetivo
-- ---------------------------------------------------------------------
alter table public.body_weights add column if not exists height_cm numeric(5,1) check (height_cm between 100 and 250);
alter table public.profiles add column if not exists fitness_goal text check (fitness_goal in ('bajar_grasa','ganar_musculo','mantener','salud','rendimiento'));

-- La estatura más reciente queda también en el perfil
create or replace function private.tg_body_weight_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.height_cm is not null and not exists (select 1 from public.body_weights b where b.user_id = new.user_id and b.height_cm is not null and b.day > new.day) then
    update public.profiles set height_cm = new.height_cm where id = new.user_id;
  end if;
  update public.profiles set start_weight_kg = coalesce(start_weight_kg, new.weight_kg) where id = new.user_id;
  return null;
end;
$$;
drop trigger if exists tg_after on public.body_weights;
create trigger tg_after after insert or update on public.body_weights for each row execute function private.tg_body_weight_after();

-- Motor de la racha actualizado (pausas y días de mínimos)
create or replace function private.default_rules()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'conditions', jsonb_build_object('workout', true, 'activity', true, 'water', false, 'steps', false, 'habits', false),
    'require', 'any',
    'min_workout_minutes', 0,
    'min_activity_minutes', 30,
    'min_steps', 8000,
    'min_water_ml', 2000,
    'min_habit_checks', 1,
    'weekly_workouts_target', 4,
    'rest_weekdays', '[]'::jsonb,
    'rest_days_per_week', 1,
    'day_cutoff_minutes', 0,
    'recovery_per_month', 1,
    'easy_days_per_month', 4,
    'easy_min_minutes', 10,
    'special_rules', ''
  );
$$;

create or replace function private.normalize_rules(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  d jsonb := private.default_rules();
  r jsonb;
  c jsonb;
  k text;
  n int;
  wd jsonb;
  v int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Reglas inválidas';
  end if;
  r := d || (p - 'conditions');
  c := d->'conditions';
  if p ? 'conditions' then
    if jsonb_typeof(p->'conditions') <> 'object' then raise exception 'Condiciones inválidas'; end if;
    for k in select jsonb_object_keys(d->'conditions') loop
      if p->'conditions' ? k then
        if jsonb_typeof(p->'conditions'->k) <> 'boolean' then raise exception 'Condición % inválida', k; end if;
        c := jsonb_set(c, array[k], p->'conditions'->k);
      end if;
    end loop;
  end if;
  select count(*) into n from jsonb_each(c) where value = 'true'::jsonb;
  if n = 0 then raise exception 'Debe haber al menos una actividad que cuente para la racha'; end if;
  r := jsonb_set(r, '{conditions}', c);

  if (r->>'require') not in ('any','all') then raise exception 'Modo de cumplimiento inválido'; end if;

  -- numéricos con rangos
  perform 1 where (r->>'min_workout_minutes')::int between 0 and 600
    and (r->>'min_activity_minutes')::int between 1 and 600
    and (r->>'min_steps')::int between 100 and 100000
    and (r->>'min_water_ml')::int between 250 and 10000
    and (r->>'min_habit_checks')::int between 1 and 50
    and (r->>'weekly_workouts_target')::int between 0 and 14
    and (r->>'rest_days_per_week')::int between 0 and 3
    and (r->>'day_cutoff_minutes')::int between 0 and 360
    and (r->>'recovery_per_month')::int between 0 and 5
    and (r->>'easy_days_per_month')::int between 0 and 10
    and (r->>'easy_min_minutes')::int between 1 and 60;
  if not found then raise exception 'Algún valor de las reglas está fuera de rango'; end if;

  -- normalizar tipos numéricos
  for k in select unnest(array['min_workout_minutes','min_activity_minutes','min_steps','min_water_ml','min_habit_checks','weekly_workouts_target','rest_days_per_week','day_cutoff_minutes','recovery_per_month','easy_days_per_month','easy_min_minutes']) loop
    r := jsonb_set(r, array[k], to_jsonb((r->>k)::int));
  end loop;

  wd := r->'rest_weekdays';
  if jsonb_typeof(wd) <> 'array' or jsonb_array_length(wd) > 3 then
    raise exception 'Días de descanso compartidos inválidos (máximo 3)';
  end if;
  for v in select (x)::int from jsonb_array_elements_text(wd) x loop
    if v < 0 or v > 6 then raise exception 'Día de la semana inválido'; end if;
  end loop;
  r := jsonb_set(r, '{rest_weekdays}', coalesce((select jsonb_agg(distinct (x)::int order by (x)::int) from jsonb_array_elements_text(wd) x), '[]'::jsonb));

  if jsonb_typeof(r->'special_rules') <> 'string' or char_length(r->>'special_rules') > 500 then
    raise exception 'Reglas especiales: máximo 500 caracteres';
  end if;

  -- descartar claves desconocidas
  return (select jsonb_object_agg(key, value) from jsonb_each(r) where d ? key);
end;
$$;

create or replace function private.compute_member(p_couple uuid, p_uid uuid, p_day date, p_now timestamptz,
  out status text, out details jsonb, out rules_version int)
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  rules jsonb;
  cond jsonb;
  end_ts timestamptz;
  is_rest boolean;
  n_workouts int; act_min int; n_steps int; water int; habit_n int;
  required text[] := '{}';
  met text[] := '{}';
  has_any boolean;
  any_workouts int;
  is_paused boolean;
  is_easy boolean;
  easy_min int;
begin
  select * into r from private.rules_for(p_couple, p_day);
  rules := r.rules; rules_version := r.version;
  cond := rules->'conditions';
  end_ts := private.day_end(p_uid, p_couple, p_day);

  is_rest := (extract(dow from p_day)::int in (select (x)::int from jsonb_array_elements_text(rules->'rest_weekdays') x))
          or exists (select 1 from public.rest_days rd where rd.user_id = p_uid and rd.day = p_day and rd.created_at < end_ts);

  -- Pausa (enfermedad, lesión, viaje…): congela el día. Solo cuenta si se creó antes del cierre.
  is_paused := exists (select 1 from public.pauses pz where pz.user_id = p_uid and pz.start_date <= p_day
                         and (pz.end_date is null or pz.end_date >= p_day) and pz.created_at < end_ts);
  -- Día de mínimos: elegido ese día (con cupo mensual) o por un evento "día suave" planificado ANTES de que empiece el día.
  is_easy := exists (select 1 from public.easy_days ed where ed.user_id = p_uid and ed.day = p_day and ed.created_at < end_ts)
          or exists (select 1 from public.calendar_events ce where ce.couple_id = p_couple and ce.created_by = p_uid and ce.lighten
                       and p_day between ce.event_date and coalesce(ce.end_date, ce.event_date)
                       and ce.created_at < private.day_end(p_uid, p_couple, p_day - 1));
  easy_min := coalesce((rules->>'easy_min_minutes')::int, 10);
  select count(*) into any_workouts from public.workouts w
   where w.user_id = p_uid and w.local_day = p_day and w.created_at < end_ts;

  select count(*) into n_workouts from public.workouts w
   where w.user_id = p_uid and w.local_day = p_day and w.created_at < end_ts
     and coalesce(w.duration_min, 0) >= (rules->>'min_workout_minutes')::int;
  select coalesce(sum(a.minutes),0), coalesce(sum(a.steps),0) into act_min, n_steps from public.activity_logs a
   where a.user_id = p_uid and a.local_day = p_day and a.created_at < end_ts;
  select greatest(coalesce(sum(wl.amount_ml),0),0) into water from public.water_logs wl
   where wl.user_id = p_uid and wl.local_day = p_day and wl.created_at < end_ts;
  select count(*) into habit_n from public.habit_logs hl
   where hl.user_id = p_uid and hl.local_day = p_day and hl.created_at < end_ts;

  if (cond->>'workout')::boolean then required := required || 'workout'::text; if n_workouts >= 1 then met := met || 'workout'::text; end if; end if;
  if (cond->>'activity')::boolean then required := required || 'activity'::text; if act_min >= (rules->>'min_activity_minutes')::int then met := met || 'activity'::text; end if; end if;
  if (cond->>'steps')::boolean then required := required || 'steps'::text; if n_steps >= (rules->>'min_steps')::int then met := met || 'steps'::text; end if; end if;
  if (cond->>'water')::boolean then required := required || 'water'::text; if water >= (rules->>'min_water_ml')::int then met := met || 'water'::text; end if; end if;
  if (cond->>'habits')::boolean then required := required || 'habits'::text; if habit_n >= (rules->>'min_habit_checks')::int then met := met || 'habits'::text; end if; end if;

  has_any := n_workouts > 0 or act_min > 0 or n_steps > 0 or water > 0 or habit_n > 0;

  if (rules->>'require' = 'any' and cardinality(met) >= 1)
     or (rules->>'require' = 'all' and cardinality(met) = cardinality(required)) then
    status := 'completed';
  elsif is_easy and (any_workouts >= 1 or act_min >= easy_min) then
    status := 'completed';
  elsif is_paused then
    status := 'paused';
  elsif is_rest then
    status := 'rest';
  elsif p_now >= end_ts then
    status := 'missed';
  elsif has_any then
    status := 'in_progress';
  else
    status := 'pending';
  end if;

  details := jsonb_build_object(
    'workouts', n_workouts, 'activity_minutes', act_min, 'steps', n_steps,
    'water_ml', water, 'habit_checks', habit_n, 'is_rest', is_rest,
    'required', to_jsonb(required), 'met', to_jsonb(met), 'require', rules->>'require',
    'day_end', end_ts, 'is_easy', is_easy, 'is_paused', is_paused, 'easy_min', easy_min);
end;
$$;

create or replace function private.recompute_streak(p_couple uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  d record;
  cur int := 0;
  best int;
  last_day date;
begin
  for d in select * from public.streak_days where couple_id = p_couple order by day desc loop
    if d.status = 'completed' then
      cur := cur + 1;
      last_day := coalesce(last_day, d.day);
    elsif d.status in ('rest','recovered','paused') then
      continue;
    elsif d.status = 'missed' and d.finalized then
      exit;
    elsif d.status = 'missed' then
      -- uno ya no cumplió pero el día no cerró para el otro: la racha está rota
      exit;
    else
      continue; -- día en curso (pendiente / en progreso)
    end if;
  end loop;

  with s as (
    select status, sum(case when status = 'missed' then 1 else 0 end) over (order by day) grp
    from public.streak_days where couple_id = p_couple
  )
  select coalesce(max(cnt),0) into best from (select count(*) filter (where status='completed') cnt from s group by grp) t;

  insert into public.streaks(couple_id, current_count, best_count, last_completed_day, updated_at)
  values (p_couple, cur, greatest(best, cur), last_day, now())
  on conflict (couple_id) do update set
    current_count = excluded.current_count,
    best_count = greatest(public.streaks.best_count, excluded.best_count),
    last_completed_day = excluded.last_completed_day,
    updated_at = now();
  return cur;
end;
$$;

create or replace function private.refresh_couple_day(p_couple uuid, p_day date, p_closing boolean, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare
  cpl record;
  sd record;
  m uuid;
  mem uuid[];
  st text[] := '{}';
  res record;
  old_member text;
  new_status text;
  rv int;
  prev_count int;
  new_count int;
begin
  select * into cpl from public.couples where id = p_couple;
  if cpl is null or cpl.status <> 'active' or p_day < cpl.streak_start_date then return; end if;

  -- bloquear la fila del día para evitar condiciones de carrera
  insert into public.streak_days(couple_id, day, status) values (p_couple, p_day, 'pending')
  on conflict (couple_id, day) do nothing;
  select * into sd from public.streak_days where couple_id = p_couple and day = p_day for update;
  if sd.finalized then return; end if;

  select array_agg(x) into mem from private.members(p_couple) x;
  if coalesce(cardinality(mem),0) < 2 then return; end if;

  foreach m in array mem loop
    select * into res from private.compute_member(p_couple, m, p_day, p_now);
    if p_closing and res.status in ('pending','in_progress') then res.status := 'missed'; end if;
    select status into old_member from public.member_day_status where couple_id = p_couple and user_id = m and day = p_day;
    insert into public.member_day_status(couple_id, user_id, day, status, details, rules_version, updated_at)
    values (p_couple, m, p_day, res.status, res.details, res.rules_version, now())
    on conflict (couple_id, user_id, day) do update
      set status = excluded.status, details = excluded.details, rules_version = excluded.rules_version, updated_at = now()
      where public.member_day_status.status is distinct from excluded.status
         or public.member_day_status.details is distinct from excluded.details;
    st := st || res.status::text;
    rv := res.rules_version;
    if res.status = 'completed' and old_member is distinct from 'completed' and not p_closing then
      perform private.notify(private.partner_of(m), 'partner_activity',
        private.display_name(m) || ' completó su día 💪',
        '¡Ahora te toca a ti para sumar a la racha!',
        jsonb_build_object('day', p_day, 'user_id', m), 'partner_done:' || m || ':' || p_day);
    end if;
  end loop;

  if st[1] in ('completed','rest','paused') and st[2] in ('completed','rest','paused') then
    -- si alguno está en pausa, el día queda "congelado": no suma ni rompe la racha
    new_status := case when 'paused' = any(st) then 'paused' when st[1] = 'rest' and st[2] = 'rest' then 'rest' else 'completed' end;
  elsif 'missed' = any(st) then
    new_status := 'missed';
  elsif 'completed' = any(st) or 'in_progress' = any(st) or 'rest' = any(st) or 'paused' = any(st) then
    new_status := 'in_progress';
  else
    new_status := 'pending';
  end if;

  select current_count into prev_count from public.streaks where couple_id = p_couple;

  update public.streak_days set
    status = new_status,
    rules_version = rv,
    finalized = p_closing,
    finalized_at = case when p_closing then now() else null end,
    completed_at = case when new_status = 'completed' then coalesce(completed_at, now()) else null end
  where couple_id = p_couple and day = p_day;

  new_count := private.recompute_streak(p_couple);

  if new_status = 'completed' and sd.status is distinct from 'completed' then
    foreach m in array mem loop
      perform private.notify(m, 'streak', '¡Racha +1! 🔥 ' || new_count || ' días',
        'Los dos cumplieron hoy. ¡Siguen ardiendo juntos!',
        jsonb_build_object('day', p_day, 'count', new_count), 'streak_up:' || p_couple || ':' || p_day);
    end loop;
  elsif new_status = 'missed' and sd.status is distinct from 'missed' and coalesce(prev_count,0) > 0 then
    foreach m in array mem loop
      perform private.notify(m, 'streak', 'La racha se apagó 💔',
        'Llevaban ' || prev_count || ' días. ¡Vuelvan a encenderla hoy!',
        jsonb_build_object('day', p_day, 'lost', prev_count), 'streak_lost:' || p_couple || ':' || p_day);
    end loop;
  end if;
end;
$$;

create or replace function private.xp_parts(p_uid uuid, p_from date, p_to date,
  out workouts bigint, out activity_minutes bigint, out water_ml bigint, out habit_checks bigint,
  out days_completed bigint, out couple_days bigint, out xp bigint)
language plpgsql stable security definer set search_path = '' as $$
declare joint bigint;
begin
  select count(*) into workouts from public.workouts w where w.user_id = p_uid and w.local_day between p_from and p_to;
  select coalesce(sum(a.minutes), 0) into activity_minutes from public.activity_logs a where a.user_id = p_uid and a.local_day between p_from and p_to;
  select greatest(coalesce(sum(wl.amount_ml), 0), 0) into water_ml from public.water_logs wl where wl.user_id = p_uid and wl.local_day between p_from and p_to;
  select count(*) into habit_checks from public.habit_logs hl where hl.user_id = p_uid and hl.local_day between p_from and p_to;
  select count(*) into days_completed from public.member_day_status m where m.user_id = p_uid and m.status = 'completed' and m.day between p_from and p_to;
  select count(*) into couple_days from public.streak_days sd
    join public.couple_members cm on cm.couple_id = sd.couple_id and cm.user_id = p_uid
    where sd.status = 'completed' and sd.day between p_from and p_to;
  select count(*) into joint from public.workouts w where w.user_id = p_uid and w.local_day between p_from and p_to
    and (w.joint_of is not null or exists (select 1 from public.workouts c where c.joint_of = w.id));
  xp := joint * 20 + workouts * 40 + activity_minutes + water_ml / 50 + habit_checks * 10 + days_completed * 25 + couple_days * 15;
end;
$$;

revoke execute on function public.couple_calendar(date, date) from public, anon;
grant execute on function public.couple_calendar(date, date) to authenticated;
revoke execute on function public.confirm_joint_workout(uuid) from public, anon;
grant execute on function public.confirm_joint_workout(uuid) to authenticated;
revoke execute on function public.pending_joint_workouts() from public, anon;
grant execute on function public.pending_joint_workouts() to authenticated;
revoke execute on function public.partner_cycle() from public, anon;
grant execute on function public.partner_cycle() to authenticated;
revoke execute on function public.my_cycle() from public, anon;
grant execute on function public.my_cycle() to authenticated;
revoke execute on function private.cycle_phase(uuid, date) from public;

-- Tiempo real para lo que ve la pareja
do $$
declare t text;
begin
  foreach t in array array['pauses','easy_days','checkins','injuries','plans'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when others then null; end;
  end loop;
end $$;
