-- FUEGO JUNTOS · instalación completa de la base de datos.
-- Generado automáticamente desde supabase/migrations. Se puede ejecutar más de una vez.

-- >>>>>>>>>>>>>>>>>>>> 0001_schema.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0001 · Esquema de tablas
-- =====================================================================
-- Datos personales: pertenecen a un user_id (solo su dueño los ve en bruto).
-- Datos compartidos: pertenecen a un couple_id (los ven ambos miembros).
-- Tablas de racha (member_day_status, streak_days, streaks): solo las
-- escriben funciones del servidor, nunca el navegador.
-- =====================================================================

do $$ begin create extension if not exists pgcrypto; exception when others then null; end $$; -- opcional (gen_random_uuid ya es nativo)

create schema if not exists private;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Sin nombre' check (char_length(display_name) between 1 and 40),
  avatar_path text,
  bio text check (char_length(bio) <= 200),
  birthday date,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  water_goal_ml int not null default 2500 check (water_goal_ml between 250 and 10000),
  steps_goal int not null default 8000 check (steps_goal between 0 and 100000),
  activity_goal_min int not null default 30 check (activity_goal_min between 0 and 1440),
  weekly_workouts_goal int not null default 4 check (weekly_workouts_goal between 0 and 14),
  theme text not null default 'system' check (theme in ('system','light','dark')),
  accent text not null default 'fuego' check (accent in ('fuego','rosa','rojo')),
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Parejas
-- ---------------------------------------------------------------------
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text check (char_length(name) <= 60),
  together_since date,
  anniversary_date date,
  status text not null default 'active' check (status in ('active','ended')),
  streak_start_date date not null default current_date,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users(id)
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (couple_id, user_id)
);
-- Un usuario solo puede estar en UNA pareja activa.
create unique index if not exists couple_members_one_active
  on public.couple_members(user_id) where left_at is null;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id),
  used_at timestamptz,
  revoked boolean not null default false
);
create index if not exists invitations_inviter on public.invitations(inviter_id);

-- ---------------------------------------------------------------------
-- Reglas de racha (versionadas, nunca se editan: se crean versiones nuevas)
-- ---------------------------------------------------------------------
create table if not exists public.streak_rules (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  version int not null,
  effective_from date not null,
  rules jsonb not null,
  proposed_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  proposal_id uuid,
  created_at timestamptz not null default now(),
  unique (couple_id, version)
);
create index if not exists streak_rules_lookup on public.streak_rules(couple_id, effective_from desc, version desc);

-- Estado diario de cada integrante (calculado en el servidor)
create table if not exists public.member_day_status (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  status text not null check (status in ('pending','in_progress','completed','rest','missed')),
  details jsonb not null default '{}'::jsonb,
  rules_version int,
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id, day)
);

-- Estado diario de la pareja (calculado en el servidor)
create table if not exists public.streak_days (
  couple_id uuid not null references public.couples(id) on delete cascade,
  day date not null,
  status text not null check (status in ('pending','in_progress','completed','rest','missed','recovered')),
  finalized boolean not null default false,
  finalized_at timestamptz,
  rules_version int,
  completed_at timestamptz,
  primary key (couple_id, day)
);

create table if not exists public.streaks (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  current_count int not null default 0,
  best_count int not null default 0,
  last_completed_day date,
  updated_at timestamptz not null default now()
);

-- Días de descanso personales (limitados por las reglas compartidas)
create table if not exists public.rest_days (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  reason text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------
-- Gimnasio
-- ---------------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  muscle_group text not null check (muscle_group in ('pecho','espalda','hombros','biceps','triceps','piernas','gluteos','abdomen','cardio','otros')),
  notes text check (char_length(notes) <= 500),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 500),
  is_favorite boolean not null default false,
  weekdays int[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  position int not null default 0,
  target_sets int check (target_sets between 1 and 50),
  target_reps int check (target_reps between 1 and 1000),
  target_weight_kg numeric(6,2) check (target_weight_kg between 0 and 1000),
  rest_seconds int check (rest_seconds between 0 and 3600),
  notes text check (char_length(notes) <= 300)
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  routine_id uuid references public.routines(id) on delete set null,
  title text not null default 'Entrenamiento' check (char_length(title) between 1 and 80),
  performed_at timestamptz not null default now(),
  duration_min int check (duration_min between 0 and 1440),
  notes text check (char_length(notes) <= 1000),
  local_day date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workouts_user_day on public.workouts(user_id, local_day);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  set_number int not null default 1 check (set_number between 1 and 100),
  reps int check (reps between 0 and 1000),
  weight_kg numeric(6,2) check (weight_kg between 0 and 1000),
  duration_sec int check (duration_sec between 0 and 86400),
  rest_sec int check (rest_sec between 0 and 3600),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists workout_sets_workout on public.workout_sets(workout_id);
create index if not exists workout_sets_exercise on public.workout_sets(exercise_id);

-- ---------------------------------------------------------------------
-- Agua y actividad
-- ---------------------------------------------------------------------
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  amount_ml int not null check (amount_ml between -5000 and 5000 and amount_ml <> 0),
  label text check (char_length(label) <= 40),
  performed_at timestamptz not null default now(),
  local_day date not null,
  created_at timestamptz not null default now()
);
create index if not exists water_logs_user_day on public.water_logs(user_id, local_day);

create table if not exists public.water_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  label text not null check (char_length(label) between 1 and 30),
  amount_ml int not null check (amount_ml between 10 and 5000),
  icon text not null default 'glass' check (icon in ('glass','bottle','cup','custom')),
  position int not null default 0
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('caminata','pasos','cardio','bicicleta','correr','natacion','deporte','yoga','otro')),
  minutes int not null default 0 check (minutes between 0 and 1440),
  steps int not null default 0 check (steps between 0 and 200000),
  distance_km numeric(6,2) check (distance_km between 0 and 1000),
  notes text check (char_length(notes) <= 500),
  performed_at timestamptz not null default now(),
  local_day date not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_day on public.activity_logs(user_id, local_day);

-- ---------------------------------------------------------------------
-- Hábitos, metas, retos
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 30),
  color text not null default '#ef4444',
  emoji text check (char_length(emoji) <= 8),
  unique (user_id, name)
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  category_id uuid references public.categories(id) on delete set null,
  emoji text check (char_length(emoji) <= 8),
  frequency text not null default 'daily' check (frequency in ('daily','weekly')),
  times_per_week int not null default 7 check (times_per_week between 1 and 7),
  reminder_time time,
  start_date date not null default current_date,
  end_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  local_day date not null,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (habit_id, local_day)
);
create index if not exists habit_logs_user_day on public.habit_logs(user_id, local_day);

-- Metas: personales (user_id, couple_id null) o compartidas (couple_id, por propuesta)
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  category_id uuid references public.categories(id) on delete set null,
  category_label text check (char_length(category_label) <= 30),
  metric text not null check (metric in ('workouts','workout_days','water_ml','water_goal_days','steps','activity_minutes','activity_days','habit_checks','couple_streak_days','manual')),
  target numeric not null check (target > 0),
  frequency text not null default 'weekly' check (frequency in ('daily','weekly','monthly','once')),
  manual_progress numeric not null default 0,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('active','completed','paused','archived')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (couple_id is null))
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  metric text not null check (metric in ('workouts','workout_days','water_ml','water_goal_days','steps','activity_minutes','activity_days','habit_checks','couple_streak_days')),
  target numeric not null check (target > 0),
  mode text not null default 'each' check (mode in ('each','together')),
  consecutive boolean not null default false,
  start_date date not null default current_date,
  end_date date not null,
  badge text not null default '🔥' check (char_length(badge) <= 8),
  reward text check (char_length(reward) <= 200),
  status text not null default 'active' check (status in ('active','completed','failed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (couple_id is null)),
  check (end_date >= start_date)
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete set null,
  badge text not null,
  title text not null,
  reward text,
  earned_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

-- ---------------------------------------------------------------------
-- Espacio de pareja
-- ---------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  title text not null check (char_length(title) between 1 and 80),
  kind text not null default 'evento' check (kind in ('evento','aniversario','cumpleanos','reto','meta','fecha','visita','entrenamiento')),
  event_date date not null,
  event_time time,
  yearly boolean not null default false,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_couple_date on public.calendar_events(couple_id, event_date);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) default auth.uid(),
  kind text not null default 'text' check (kind in ('text','heart','motivation','photo')),
  body text check (char_length(body) <= 2000),
  image_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_couple_created on public.messages(couple_id, created_at desc);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 1000),
  image_path text,
  memory_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  body text not null check (char_length(body) between 1 and 500),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists notifications_unpushed on public.notifications(created_at) where pushed_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cambios compartidos (propuesta → aprobación) y auditoría
-- ---------------------------------------------------------------------
create table if not exists public.shared_change_proposals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  proposed_by uuid not null references auth.users(id),
  kind text not null check (kind in ('streak_rules','couple_settings','shared_goal','shared_goal_delete','shared_challenge','shared_challenge_cancel','streak_recovery')),
  title text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','failed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  result jsonb
);
create index if not exists proposals_couple on public.shared_change_proposals(couple_id, created_at desc);

create table if not exists public.shared_change_approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.shared_change_proposals(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  comment text check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (proposal_id, user_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  couple_id uuid references public.couples(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_couple on public.audit_logs(couple_id, created_at desc);

-- Configuración privada del servidor (URL de envío push, secreto). Nunca expuesta.
create table if not exists private.app_settings (
  key text primary key,
  value text not null
);


-- >>>>>>>>>>>>>>>>>>>> 0002_functions.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0002 · Lógica del servidor
-- Motor de rachas, vinculación, propuestas, notificaciones.
-- Toda función de este archivo usa search_path vacío y nombres completos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ayudantes de pertenencia
-- ---------------------------------------------------------------------
create or replace function private.active_couple(p_uid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select cm.couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = p_uid and cm.left_at is null and c.status = 'active'
  limit 1;
$$;

create or replace function private.my_couple()
returns uuid language sql stable security definer set search_path = '' as $$
  select private.active_couple(auth.uid());
$$;

create or replace function private.is_member(p_couple uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_couple is not null and exists (
    select 1 from public.couple_members cm
    join public.couples c on c.id = cm.couple_id
    where cm.couple_id = p_couple and cm.user_id = auth.uid()
      and cm.left_at is null and c.status = 'active'
  );
$$;

create or replace function private.partner_of(p_uid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select cm.user_id from public.couple_members cm
  where cm.couple_id = private.active_couple(p_uid)
    and cm.user_id <> p_uid and cm.left_at is null
  limit 1;
$$;

create or replace function private.is_partner(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and p_uid = private.partner_of(auth.uid());
$$;

create or replace function private.members(p_couple uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select user_id from public.couple_members
  where couple_id = p_couple and left_at is null order by joined_at, user_id;
$$;

create or replace function private.user_tz(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.profiles where id = p_uid), 'UTC');
$$;

create or replace function private.display_name(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select display_name from public.profiles where id = p_uid), 'Tu pareja');
$$;

-- ---------------------------------------------------------------------
-- Reglas
-- ---------------------------------------------------------------------
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
    'special_rules', ''
  );
$$;

-- Valida y normaliza un objeto de reglas. Lanza error si algo es inválido.
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
    and (r->>'recovery_per_month')::int between 0 and 5;
  if not found then raise exception 'Algún valor de las reglas está fuera de rango'; end if;

  -- normalizar tipos numéricos
  for k in select unnest(array['min_workout_minutes','min_activity_minutes','min_steps','min_water_ml','min_habit_checks','weekly_workouts_target','rest_days_per_week','day_cutoff_minutes','recovery_per_month']) loop
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

create or replace function private.rules_for(p_couple uuid, p_day date, out version int, out rules jsonb)
language sql stable security definer set search_path = '' as $$
  select coalesce(
           (select sr.version from public.streak_rules sr where sr.couple_id = p_couple and sr.effective_from <= p_day order by sr.effective_from desc, sr.version desc limit 1),
           (select sr.version from public.streak_rules sr where sr.couple_id = p_couple order by sr.version limit 1)),
         coalesce(
           (select sr.rules from public.streak_rules sr where sr.couple_id = p_couple and sr.effective_from <= p_day order by sr.effective_from desc, sr.version desc limit 1),
           (select sr.rules from public.streak_rules sr where sr.couple_id = p_couple order by sr.version limit 1),
           private.default_rules());
$$;

-- ---------------------------------------------------------------------
-- Días y zonas horarias
-- El "día" de cada persona es su fecha local, desplazada por el horario
-- de cierre (ej.: cierre 120 min => lo que haces hasta las 02:00 cuenta
-- para el día anterior).
-- ---------------------------------------------------------------------
create or replace function private.local_day_for(p_uid uuid, p_ts timestamptz)
returns date language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := private.user_tz(p_uid);
  c uuid := private.active_couple(p_uid);
  cutoff int := 0;
  r record;
begin
  if c is not null then
    select * into r from private.rules_for(c, (p_ts at time zone tz)::date - 1);
    cutoff := coalesce((r.rules->>'day_cutoff_minutes')::int, 0);
  end if;
  return ((p_ts at time zone tz) - make_interval(mins => cutoff))::date;
end;
$$;

create or replace function private.user_today(p_uid uuid)
returns date language sql stable security definer set search_path = '' as $$
  select private.local_day_for(p_uid, now());
$$;

create or replace function private.day_end(p_uid uuid, p_couple uuid, p_day date)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  select * into r from private.rules_for(p_couple, p_day);
  return ((p_day + 1)::timestamp + make_interval(mins => coalesce((r.rules->>'day_cutoff_minutes')::int, 0)))
         at time zone private.user_tz(p_uid);
end;
$$;

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
create or replace function private.notify(p_uid uuid, p_kind text, p_title text, p_body text,
                                          p_data jsonb default '{}'::jsonb, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  prefs jsonb;
begin
  if p_uid is null then return; end if;
  select notification_prefs into prefs from public.profiles where id = p_uid;
  if coalesce(prefs->p_kind->>'enabled', 'true') = 'false' then return; end if;
  insert into public.notifications(user_id, kind, title, body, data, dedupe_key)
  values (p_uid, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.audit(p_couple uuid, p_uid uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs(couple_id, user_id, action, details) values (p_couple, p_uid, p_action, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- MOTOR DE RACHA
-- ---------------------------------------------------------------------

-- Calcula el estado de UNA persona en UN día a partir de sus registros.
-- Solo cuentan registros creados antes del cierre de ese día (no se puede
-- "rellenar" un día pasado).
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
begin
  select * into r from private.rules_for(p_couple, p_day);
  rules := r.rules; rules_version := r.version;
  cond := rules->'conditions';
  end_ts := private.day_end(p_uid, p_couple, p_day);

  is_rest := (extract(dow from p_day)::int in (select (x)::int from jsonb_array_elements_text(rules->'rest_weekdays') x))
          or exists (select 1 from public.rest_days rd where rd.user_id = p_uid and rd.day = p_day and rd.created_at < end_ts);

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
    'day_end', end_ts);
end;
$$;

-- Recalcula racha actual y récord a partir del historial de días.
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
    elsif d.status in ('rest','recovered') then
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

-- Recalcula un día de la pareja. p_closing = true lo deja cerrado para siempre.
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

  if st[1] in ('completed','rest') and st[2] in ('completed','rest') then
    new_status := case when st[1] = 'rest' and st[2] = 'rest' then 'rest' else 'completed' end;
  elsif 'missed' = any(st) then
    new_status := 'missed';
  elsif 'completed' = any(st) or 'in_progress' = any(st) or 'rest' = any(st) then
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

-- Cierra todos los días vencidos de una pareja (en orden).
create or replace function private.finalize_couple(p_couple uuid, p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  cpl record;
  d date;
  i int := 0;
  m uuid;
  due boolean;
begin
  select * into cpl from public.couples where id = p_couple;
  if cpl is null or cpl.status <> 'active' then return 0; end if;
  select coalesce(max(day) + 1, cpl.streak_start_date) into d
    from public.streak_days where couple_id = p_couple and finalized;
  loop
    exit when i >= 400;
    due := true;
    for m in select * from private.members(p_couple) loop
      if p_now < private.day_end(m, p_couple, d) then due := false; end if;
    end loop;
    exit when not due;
    perform private.refresh_couple_day(p_couple, d, true, p_now);
    d := d + 1; i := i + 1;
  end loop;
  return i;
end;
$$;

create or replace function private.finalize_all(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare c uuid; total int := 0;
begin
  for c in select id from public.couples where status = 'active' loop
    total := total + private.finalize_couple(c, p_now);
  end loop;
  return total;
end;
$$;

-- Punto de entrada tras cualquier registro de una persona.
create or replace function private.refresh_member_day(p_uid uuid, p_day date)
returns void language plpgsql security definer set search_path = '' as $$
declare c uuid := private.active_couple(p_uid);
begin
  if c is null or p_day is null then return; end if;
  perform private.finalize_couple(c);
  perform private.refresh_couple_day(c, p_day, false);
end;
$$;

-- ---------------------------------------------------------------------
-- Métricas (para metas, retos y estadísticas)
-- ---------------------------------------------------------------------
create or replace function private.metric_days(p_uid uuid, p_metric text, p_from date, p_to date)
returns setof date language plpgsql stable security definer set search_path = '' as $$
declare goal int;
begin
  if p_metric in ('workouts','workout_days') then
    return query select distinct local_day from public.workouts where user_id = p_uid and local_day between p_from and p_to;
  elsif p_metric = 'water_goal_days' or p_metric = 'water_ml' then
    select water_goal_ml into goal from public.profiles where id = p_uid;
    return query select local_day from public.water_logs where user_id = p_uid and local_day between p_from and p_to
      group by local_day having sum(amount_ml) >= coalesce(goal, 2000);
  elsif p_metric in ('activity_minutes','activity_days','steps') then
    return query select distinct local_day from public.activity_logs where user_id = p_uid and local_day between p_from and p_to and (minutes > 0 or steps > 0);
  elsif p_metric = 'habit_checks' then
    return query select distinct local_day from public.habit_logs where user_id = p_uid and local_day between p_from and p_to;
  elsif p_metric = 'couple_streak_days' then
    return query select sd.day from public.streak_days sd where sd.couple_id = private.active_couple(p_uid) and sd.status = 'completed' and sd.day between p_from and p_to;
  end if;
end;
$$;

create or replace function private.metric_value(p_uid uuid, p_metric text, p_from date, p_to date, p_consecutive boolean default false)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v numeric;
begin
  if p_consecutive then
    select coalesce(max(cnt),0) into v from (
      select count(*) cnt from (select d, d - (row_number() over (order by d))::int grp from private.metric_days(p_uid, p_metric, p_from, p_to) d) t group by grp
    ) x;
    return v;
  end if;
  case p_metric
    when 'workouts' then select count(*) into v from public.workouts where user_id = p_uid and local_day between p_from and p_to;
    when 'workout_days' then select count(distinct local_day) into v from public.workouts where user_id = p_uid and local_day between p_from and p_to;
    when 'water_ml' then select greatest(coalesce(sum(amount_ml),0),0) into v from public.water_logs where user_id = p_uid and local_day between p_from and p_to;
    when 'water_goal_days' then select count(*) into v from private.metric_days(p_uid, 'water_goal_days', p_from, p_to);
    when 'steps' then select coalesce(sum(steps),0) into v from public.activity_logs where user_id = p_uid and local_day between p_from and p_to;
    when 'activity_minutes' then select coalesce(sum(minutes),0) into v from public.activity_logs where user_id = p_uid and local_day between p_from and p_to;
    when 'activity_days' then select count(*) into v from private.metric_days(p_uid, 'activity_days', p_from, p_to);
    when 'habit_checks' then select count(*) into v from public.habit_logs where user_id = p_uid and local_day between p_from and p_to;
    when 'couple_streak_days' then select count(*) into v from private.metric_days(p_uid, 'couple_streak_days', p_from, p_to);
    else v := 0;
  end case;
  return coalesce(v, 0);
end;
$$;

-- Período actual de una meta según su frecuencia
create or replace function private.goal_period(p_freq text, p_today date, p_start date, p_end date, out from_day date, out to_day date)
language plpgsql immutable set search_path = '' as $$
begin
  if p_freq = 'daily' then from_day := p_today; to_day := p_today;
  elsif p_freq = 'weekly' then from_day := date_trunc('week', p_today)::date; to_day := from_day + 6;
  elsif p_freq = 'monthly' then from_day := date_trunc('month', p_today)::date; to_day := (date_trunc('month', p_today) + interval '1 month - 1 day')::date;
  else from_day := p_start; to_day := coalesce(p_end, p_today);
  end if;
  from_day := greatest(from_day, p_start);
end;
$$;

-- Revisa metas y retos de una persona tras un registro
create or replace function private.check_goals_and_challenges(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := private.user_today(p_uid);
  c uuid := private.active_couple(p_uid);
  g record; ch record; per record;
  v numeric; done boolean; m uuid; total numeric;
begin
  for g in select * from public.goals where status = 'active' and metric <> 'manual'
             and (user_id = p_uid or (couple_id is not null and couple_id = c))
             and start_date <= today and (end_date is null or end_date >= today) loop
    select * into per from private.goal_period(g.frequency, today, g.start_date, g.end_date);
    if g.couple_id is null then
      v := private.metric_value(p_uid, g.metric, per.from_day, per.to_day);
      done := v >= g.target;
    else
      done := true;
      for m in select * from private.members(c) loop
        if private.metric_value(m, g.metric, per.from_day, per.to_day) < g.target then done := false; end if;
      end loop;
    end if;
    if done then
      if g.frequency = 'once' then
        update public.goals set status = 'completed', completed_at = now() where id = g.id;
      end if;
      for m in select p_uid where g.couple_id is null union select * from private.members(c) where g.couple_id is not null loop
        perform private.notify(m, 'goals', '🎯 Meta cumplida: ' || g.name, 'Período ' || per.from_day || ' – ' || per.to_day,
          jsonb_build_object('goal_id', g.id), 'goal:' || g.id || ':' || per.from_day);
      end loop;
    end if;
  end loop;

  for ch in select * from public.challenges where status = 'active'
              and (user_id = p_uid or (couple_id is not null and couple_id = c))
              and start_date <= today and end_date >= today loop
    if ch.couple_id is null then
      done := private.metric_value(p_uid, ch.metric, ch.start_date, ch.end_date, ch.consecutive) >= ch.target;
    elsif ch.mode = 'together' then
      total := 0;
      for m in select * from private.members(c) loop
        total := total + private.metric_value(m, ch.metric, ch.start_date, ch.end_date, ch.consecutive);
      end loop;
      done := total >= ch.target;
    else
      done := true;
      for m in select * from private.members(c) loop
        if private.metric_value(m, ch.metric, ch.start_date, ch.end_date, ch.consecutive) < ch.target then done := false; end if;
      end loop;
    end if;
    if done then
      update public.challenges set status = 'completed', completed_at = now() where id = ch.id;
      for m in select p_uid where ch.couple_id is null union select * from private.members(c) where ch.couple_id is not null loop
        insert into public.user_badges(user_id, challenge_id, badge, title, reward)
        values (m, ch.id, ch.badge, ch.name, ch.reward) on conflict do nothing;
        perform private.notify(m, 'challenges', ch.badge || ' ¡Reto superado!', ch.name || coalesce(' · Recompensa: ' || ch.reward, ''),
          jsonb_build_object('challenge_id', ch.id), 'challenge:' || ch.id);
      end loop;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- TRIGGERS de registros personales
-- ---------------------------------------------------------------------
create or replace function private.tg_log_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.user_id := old.user_id;  -- nadie puede "pasarle" un registro a otra persona
  end if;
  if new.performed_at > now() + interval '10 minutes' then
    raise exception 'No se pueden registrar actividades en el futuro';
  end if;
  if new.performed_at < now() - interval '3 years' then
    raise exception 'Fecha demasiado antigua';
  end if;
  new.local_day := private.local_day_for(new.user_id, new.performed_at);
  if tg_table_name = 'workouts' then new.updated_at := now(); end if;
  return new;
end;
$$;

create or replace function private.tg_habit_log_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h record;
begin
  select * into h from public.habits where id = new.habit_id;
  if h is null or h.user_id <> new.user_id then raise exception 'Hábito no válido'; end if;
  if h.archived then raise exception 'Este hábito está archivado'; end if;
  new.created_at := now();
  new.performed_at := now();
  new.local_day := private.user_today(new.user_id);  -- siempre "hoy", lo decide el servidor
  return new;
end;
$$;

create or replace function private.tg_habit_log_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.local_day < private.user_today(old.user_id) then
    raise exception 'Solo puedes desmarcar hábitos de hoy';
  end if;
  return old;
end;
$$;

create or replace function private.tg_rest_day_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c uuid := private.active_couple(new.user_id);
  r record;
  used int;
  today date := private.user_today(new.user_id);
begin
  if tg_op = 'UPDATE' then
    raise exception 'Los días de descanso no se editan; elimínalo y créalo de nuevo';
  end if;
  new.created_at := now();
  if new.day < today then raise exception 'No puedes marcar descanso en un día pasado'; end if;
  if new.day > today + 60 then raise exception 'Máximo 60 días por adelantado'; end if;
  if c is not null then
    select * into r from private.rules_for(c, new.day);
    select count(*) into used from public.rest_days
      where user_id = new.user_id and date_trunc('week', day) = date_trunc('week', new.day::timestamp);
    if used >= (r.rules->>'rest_days_per_week')::int then
      raise exception 'Ya usaste tus % día(s) de descanso de esa semana', (r.rules->>'rest_days_per_week');
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.tg_rest_day_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.day < private.user_today(old.user_id) then
    raise exception 'No puedes quitar un descanso de un día pasado';
  end if;
  return old;
end;
$$;

create or replace function private.tg_log_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  j_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  uid uuid := coalesce((j_new->>'user_id')::uuid, (j_old->>'user_id')::uuid);
  d_new date := coalesce(j_new->>'local_day', j_new->>'day')::date;
  d_old date := coalesce(j_old->>'local_day', j_old->>'day')::date;
begin
  if d_new is not null then perform private.refresh_member_day(uid, d_new); end if;
  if d_old is not null and d_old is distinct from d_new then perform private.refresh_member_day(uid, d_old); end if;
  if tg_op <> 'DELETE' then perform private.check_goals_and_challenges(uid); end if;
  return null;
end;
$$;

drop trigger if exists tg_before on public.workouts;
create trigger tg_before before insert or update on public.workouts for each row execute function private.tg_log_before();
drop trigger if exists tg_before on public.water_logs;
create trigger tg_before before insert or update on public.water_logs for each row execute function private.tg_log_before();
drop trigger if exists tg_before on public.activity_logs;
create trigger tg_before before insert or update on public.activity_logs for each row execute function private.tg_log_before();
drop trigger if exists tg_before on public.habit_logs;
create trigger tg_before before insert or update on public.habit_logs for each row execute function private.tg_habit_log_before();
drop trigger if exists tg_before_delete on public.habit_logs;
create trigger tg_before_delete before delete on public.habit_logs for each row execute function private.tg_habit_log_delete();
drop trigger if exists tg_before on public.rest_days;
create trigger tg_before before insert or update on public.rest_days for each row execute function private.tg_rest_day_before();
drop trigger if exists tg_before_delete on public.rest_days;
create trigger tg_before_delete before delete on public.rest_days for each row execute function private.tg_rest_day_delete();

do $$
declare t text;
begin
  foreach t in array array['workouts','water_logs','activity_logs','habit_logs','rest_days'] loop
    execute format('drop trigger if exists tg_after on public.%I', t);
    execute format('create trigger tg_after after insert or update or delete on public.%I for each row execute function private.tg_log_after()', t);
  end loop;
end $$;

-- Las series heredan el dueño del entrenamiento
create or replace function private.tg_workout_set_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w_owner uuid; e_owner uuid;
begin
  select user_id into w_owner from public.workouts where id = new.workout_id;
  select user_id into e_owner from public.exercises where id = new.exercise_id;
  if w_owner is null or e_owner is null or w_owner <> e_owner then
    raise exception 'Ejercicio o entrenamiento no válido';
  end if;
  return new;
end;
$$;
drop trigger if exists tg_check on public.workout_sets;
create trigger tg_check before insert or update on public.workout_sets for each row execute function private.tg_workout_set_check();

create or replace function private.tg_routine_ex_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select user_id from public.routines where id = new.routine_id) is distinct from
     (select user_id from public.exercises where id = new.exercise_id) then
    raise exception 'Ejercicio o rutina no válidos';
  end if;
  return new;
end;
$$;
drop trigger if exists tg_check on public.routine_exercises;
create trigger tg_check before insert or update on public.routine_exercises for each row execute function private.tg_routine_ex_check();

-- Los navegadores (ICU) a veces devuelven nombres antiguos de zona horaria.
-- Se traducen al nombre actual; si no se reconoce, devuelve null.
create or replace function private.normalize_tz(p_tz text)
returns text language plpgsql stable set search_path = '' as $$
declare
  t text := case p_tz
    when 'America/Buenos_Aires' then 'America/Argentina/Buenos_Aires'
    when 'America/Cordoba' then 'America/Argentina/Cordoba'
    when 'America/Catamarca' then 'America/Argentina/Catamarca'
    when 'America/Jujuy' then 'America/Argentina/Jujuy'
    when 'America/Mendoza' then 'America/Argentina/Mendoza'
    when 'America/Indianapolis' then 'America/Indiana/Indianapolis'
    when 'America/Louisville' then 'America/Kentucky/Louisville'
    when 'Asia/Calcutta' then 'Asia/Kolkata'
    when 'Asia/Saigon' then 'Asia/Ho_Chi_Minh'
    when 'Asia/Katmandu' then 'Asia/Kathmandu'
    when 'Asia/Rangoon' then 'Asia/Yangon'
    when 'Europe/Kiev' then 'Europe/Kyiv'
    when 'Atlantic/Faeroe' then 'Atlantic/Faroe'
    when 'Pacific/Truk' then 'Pacific/Chuuk'
    when 'Pacific/Ponape' then 'Pacific/Pohnpei'
    else p_tz end;
begin
  if t is null then return null; end if;
  perform now() at time zone t;
  return t;
exception when others then
  begin
    perform now() at time zone p_tz;  -- quizá el servidor sí conoce el nombre original
    return p_tz;
  exception when others then
    return null;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfiles: creación automática y validaciones
-- ---------------------------------------------------------------------
create or replace function private.tg_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  nm text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Sin nombre'), 40);
  tz text := coalesce(private.normalize_tz(new.raw_user_meta_data->>'timezone'), 'UTC');
begin
  insert into public.profiles(id, display_name, timezone) values (new.id, nm, tz) on conflict (id) do nothing;
  insert into public.water_presets(user_id, label, amount_ml, icon, position) values
    (new.id, 'Vaso', 250, 'glass', 0), (new.id, 'Botella', 500, 'bottle', 1), (new.id, 'Botella grande', 1000, 'bottle', 2);
  insert into public.categories(user_id, name, color, emoji) values
    (new.id, 'Salud', '#ef4444', '❤️'), (new.id, 'Gimnasio', '#e11d48', '💪'), (new.id, 'Descanso', '#ec4899', '😴'), (new.id, 'Alimentación', '#f97316', '🥗');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.tg_new_user();

create or replace function private.tg_profile_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.normalize_tz(new.timezone) is null then
    raise exception 'Zona horaria no válida: %', new.timezone;
  end if;
  new.timezone := private.normalize_tz(new.timezone);
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists tg_before on public.profiles;
create trigger tg_before before update on public.profiles for each row execute function private.tg_profile_before();

-- ---------------------------------------------------------------------
-- Notificaciones de contenido de pareja
-- ---------------------------------------------------------------------
create or replace function private.tg_message_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  partner uuid := private.partner_of(new.sender_id);
  nm text := private.display_name(new.sender_id);
begin
  if new.kind = 'heart' then
    perform private.notify(partner, 'messages', nm || ' te envió un corazón ❤️', coalesce(new.body, ''), jsonb_build_object('message_id', new.id));
  elsif new.kind = 'photo' then
    perform private.notify(partner, 'messages', nm || ' te envió una foto 📸', coalesce(new.body, ''), jsonb_build_object('message_id', new.id));
  elsif new.kind = 'motivation' then
    perform private.notify(partner, 'messages', '🔥 Ánimo de ' || nm, left(coalesce(new.body, ''), 140), jsonb_build_object('message_id', new.id));
  else
    perform private.notify(partner, 'messages', 'Mensaje de ' || nm, left(coalesce(new.body, ''), 140), jsonb_build_object('message_id', new.id));
  end if;
  return null;
end;
$$;
drop trigger if exists tg_after on public.messages;
create trigger tg_after after insert on public.messages for each row execute function private.tg_message_after();

create or replace function private.tg_couple_content_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := coalesce(auth.uid(), case when tg_op = 'DELETE' then old.created_by else new.created_by end);
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'memories' then
      perform private.notify(private.partner_of(new.created_by), 'couple', '📷 Nuevo recuerdo', new.title, jsonb_build_object('memory_id', new.id));
    elsif tg_table_name = 'calendar_events' then
      perform private.notify(private.partner_of(new.created_by), 'dates', '📅 Nuevo evento: ' || new.title, to_char(new.event_date, 'DD/MM/YYYY'), jsonb_build_object('event_id', new.id));
    end if;
  elsif tg_op = 'DELETE' then
    perform private.audit(old.couple_id, actor, 'delete_' || tg_table_name, to_jsonb(old));
  end if;
  return null;
end;
$$;
drop trigger if exists tg_after on public.memories;
create trigger tg_after after insert or delete on public.memories for each row execute function private.tg_couple_content_after();
drop trigger if exists tg_after on public.calendar_events;
create trigger tg_after after insert or delete on public.calendar_events for each row execute function private.tg_couple_content_after();

-- created_by / sender no se pueden falsificar
create or replace function private.tg_force_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'messages' then new.sender_id := auth.uid(); new.read_at := null;
    else new.created_by := auth.uid(); end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['messages','memories','calendar_events','notes'] loop
    execute format('drop trigger if exists tg_author on public.%I', t);
    execute format('create trigger tg_author before insert on public.%I for each row execute function private.tg_force_author()', t);
  end loop;
end $$;

-- =====================================================================
-- RPC PÚBLICAS (las llama la app)
-- =====================================================================

-- Crea un código de invitación
create or replace function public.create_invitation()
returns table(code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  i int;
  n int;
begin
  if me is null then raise exception 'Debes iniciar sesión'; end if;
  if private.active_couple(me) is not null then raise exception 'Ya estás vinculado/a con tu pareja'; end if;
  select count(*) into n from public.invitations inv where inv.inviter_id = me and inv.created_at > now() - interval '1 day';
  if n >= 10 then raise exception 'Demasiados códigos hoy. Intenta mañana.'; end if;
  update public.invitations inv set revoked = true where inv.inviter_id = me and inv.used_by is null and not inv.revoked;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invitations inv where inv.code = c);
  end loop;
  insert into public.invitations(code, inviter_id) values (c, me);
  return query select inv.code, inv.expires_at from public.invitations inv where inv.code = c;
end;
$$;

-- Acepta una invitación y crea la pareja
create or replace function public.accept_invitation(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv record;
  cid uuid;
  start_day date;
begin
  if me is null then raise exception 'Debes iniciar sesión'; end if;
  select * into inv from public.invitations where code = upper(trim(p_code)) for update;
  if inv is null or inv.revoked then raise exception 'Código no válido'; end if;
  if inv.used_by is not null then raise exception 'Este código ya fue usado'; end if;
  if inv.expires_at < now() then raise exception 'El código expiró. Pide uno nuevo.'; end if;
  if inv.inviter_id = me then raise exception 'No puedes usar tu propio código'; end if;
  if private.active_couple(me) is not null then raise exception 'Ya estás vinculado/a'; end if;
  if private.active_couple(inv.inviter_id) is not null then raise exception 'Esa persona ya tiene pareja vinculada'; end if;

  start_day := least(private.local_day_for(me, now()), private.local_day_for(inv.inviter_id, now()));
  insert into public.couples(streak_start_date) values (start_day) returning id into cid;
  insert into public.couple_members(couple_id, user_id) values (cid, inv.inviter_id), (cid, me);
  insert into public.streak_rules(couple_id, version, effective_from, rules, proposed_by, approved_by)
  values (cid, 1, start_day, private.default_rules(), inv.inviter_id, me);
  insert into public.streaks(couple_id) values (cid);
  update public.invitations set used_by = me, used_at = now() where id = inv.id;

  perform private.audit(cid, me, 'couple_linked', jsonb_build_object('inviter', inv.inviter_id, 'invitee', me));
  perform private.notify(inv.inviter_id, 'couple', '💞 ¡' || private.display_name(me) || ' aceptó tu invitación!', 'Ya tienen su racha compartida. ¡A encenderla!');
  perform private.refresh_couple_day(cid, start_day, false);
  return cid;
end;
$$;

-- Desvincular (no borra datos personales)
create or replace function public.unlink_couple()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid := private.active_couple(me);
  partner uuid := private.partner_of(me);
begin
  if cid is null then raise exception 'No tienes pareja vinculada'; end if;
  update public.couples set status = 'ended', ended_at = now(), ended_by = me where id = cid;
  update public.couple_members set left_at = now() where couple_id = cid and left_at is null;
  update public.shared_change_proposals set status = 'cancelled', resolved_at = now() where couple_id = cid and status = 'pending';
  perform private.audit(cid, me, 'couple_unlinked', '{}'::jsonb);
  perform private.notify(partner, 'couple', 'Vinculación finalizada', private.display_name(me) || ' desvinculó la pareja. Tus datos personales se conservan.');
end;
$$;

-- Asegura que existan los estados de hoy (se llama al abrir la app)
create or replace function public.refresh_today()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c uuid := private.active_couple(me);
  m uuid;
begin
  if c is null then return; end if;
  perform private.finalize_couple(c);
  for m in select * from private.members(c) loop
    perform private.refresh_couple_day(c, private.user_today(m), false);
  end loop;
end;
$$;

-- Día local "hoy" de la persona (según su zona horaria y cierre)
create or replace function public.my_today()
returns date language sql stable security definer set search_path = '' as $$
  select private.user_today(auth.uid());
$$;

-- Validación de propuestas
create or replace function private.validate_proposal(p_couple uuid, p_kind text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  r record;
  d date;
  used int;
  today date;
begin
  if p_kind = 'streak_rules' then
    return jsonb_build_object('rules', private.normalize_rules(p->'rules'));
  elsif p_kind = 'couple_settings' then
    if p ? 'name' and char_length(p->>'name') > 60 then raise exception 'Nombre demasiado largo'; end if;
    perform (p->>'together_since')::date, (p->>'anniversary_date')::date;
    return jsonb_strip_nulls(jsonb_build_object('name', p->'name', 'together_since', p->'together_since', 'anniversary_date', p->'anniversary_date'));
  elsif p_kind = 'shared_goal' then
    if coalesce(char_length(p->>'name'),0) not between 1 and 80 then raise exception 'La meta necesita un nombre'; end if;
    if (p->>'metric') not in ('workouts','workout_days','water_ml','water_goal_days','steps','activity_minutes','activity_days','habit_checks','couple_streak_days','manual') then raise exception 'Métrica no válida'; end if;
    if coalesce((p->>'target')::numeric, 0) <= 0 then raise exception 'El objetivo debe ser mayor que 0'; end if;
    if coalesce(p->>'frequency','weekly') not in ('daily','weekly','monthly','once') then raise exception 'Frecuencia no válida'; end if;
    return p;
  elsif p_kind = 'shared_challenge' then
    if coalesce(char_length(p->>'name'),0) not between 1 and 80 then raise exception 'El reto necesita un nombre'; end if;
    if (p->>'metric') not in ('workouts','workout_days','water_ml','water_goal_days','steps','activity_minutes','activity_days','habit_checks','couple_streak_days') then raise exception 'Métrica no válida'; end if;
    if coalesce((p->>'target')::numeric, 0) <= 0 then raise exception 'El objetivo debe ser mayor que 0'; end if;
    if (p->>'end_date')::date < coalesce((p->>'start_date')::date, current_date) then raise exception 'La fecha límite debe ser posterior al inicio'; end if;
    if coalesce(p->>'mode','each') not in ('each','together') then raise exception 'Modo no válido'; end if;
    return p;
  elsif p_kind = 'shared_goal_delete' then
    if not exists (select 1 from public.goals where id = (p->>'goal_id')::uuid and couple_id = p_couple) then raise exception 'Meta no encontrada'; end if;
    return p;
  elsif p_kind = 'shared_challenge_cancel' then
    if not exists (select 1 from public.challenges where id = (p->>'challenge_id')::uuid and couple_id = p_couple and status = 'active') then raise exception 'Reto no encontrado'; end if;
    return p;
  elsif p_kind = 'streak_recovery' then
    d := (p->>'day')::date;
    select * into r from private.rules_for(p_couple, d);
    today := (select max(private.user_today(m)) from private.members(p_couple) m);
    if not exists (select 1 from public.streak_days where couple_id = p_couple and day = d and status = 'missed' and finalized) then
      raise exception 'Ese día no se puede recuperar (no está perdido o aún no cerró)';
    end if;
    if d < today - 3 then raise exception 'Solo se pueden recuperar días de los últimos 3 días'; end if;
    select count(*) into used from public.streak_days
      where couple_id = p_couple and status = 'recovered' and date_trunc('month', day) = date_trunc('month', d::timestamp);
    if used >= (r.rules->>'recovery_per_month')::int then
      raise exception 'Ya usaron las recuperaciones permitidas este mes (%)', r.rules->>'recovery_per_month';
    end if;
    return jsonb_build_object('day', d);
  end if;
  raise exception 'Tipo de propuesta no válido';
end;
$$;

create or replace function public.propose_change(p_kind text, p_title text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c uuid := private.active_couple(me);
  p jsonb;
  pid uuid;
begin
  if c is null then raise exception 'Necesitas estar vinculado/a con tu pareja'; end if;
  p := private.validate_proposal(c, p_kind, p_payload);
  if p_kind in ('streak_rules','couple_settings') and exists (
     select 1 from public.shared_change_proposals where couple_id = c and kind = p_kind and status = 'pending') then
    raise exception 'Ya hay una propuesta pendiente de este tipo. Resuélvela o cancélala primero.';
  end if;
  insert into public.shared_change_proposals(couple_id, proposed_by, kind, title, payload)
  values (c, me, p_kind, left(coalesce(nullif(trim(p_title),''), 'Propuesta de cambio'), 120), p)
  returning id into pid;
  perform private.audit(c, me, 'proposal_created', jsonb_build_object('proposal_id', pid, 'kind', p_kind, 'payload', p));
  perform private.notify(private.partner_of(me), 'proposals', '🗳️ ' || private.display_name(me) || ' propone un cambio',
    left(coalesce(p_title, ''), 140), jsonb_build_object('proposal_id', pid), 'proposal:' || pid);
  return pid;
end;
$$;

create or replace function private.apply_proposal(pr public.shared_change_proposals, p_approver uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := private.validate_proposal(pr.couple_id, pr.kind, pr.payload);
  eff date;
  v int;
  new_id uuid;
begin
  if pr.kind = 'streak_rules' then
    -- Se aplica desde MAÑANA (para el más adelantado de los dos): nunca altera el pasado ni el día en curso.
    eff := (select max(private.user_today(m)) from private.members(pr.couple_id) m) + 1;
    select coalesce(max(version),0) + 1 into v from public.streak_rules where couple_id = pr.couple_id;
    insert into public.streak_rules(couple_id, version, effective_from, rules, proposed_by, approved_by, proposal_id)
    values (pr.couple_id, v, eff, p->'rules', pr.proposed_by, p_approver, pr.id);
    return jsonb_build_object('version', v, 'effective_from', eff);
  elsif pr.kind = 'couple_settings' then
    update public.couples set
      name = coalesce(p->>'name', name),
      together_since = coalesce((p->>'together_since')::date, together_since),
      anniversary_date = coalesce((p->>'anniversary_date')::date, anniversary_date)
    where id = pr.couple_id;
    return p;
  elsif pr.kind = 'shared_goal' then
    insert into public.goals(couple_id, created_by, name, description, category_label, metric, target, frequency, start_date, end_date)
    values (pr.couple_id, pr.proposed_by, p->>'name', p->>'description', p->>'category_label', p->>'metric', (p->>'target')::numeric,
            coalesce(p->>'frequency','weekly'), coalesce((p->>'start_date')::date, current_date), (p->>'end_date')::date)
    returning id into new_id;
    return jsonb_build_object('goal_id', new_id);
  elsif pr.kind = 'shared_goal_delete' then
    update public.goals set status = 'archived' where id = (p->>'goal_id')::uuid and couple_id = pr.couple_id;
    return p;
  elsif pr.kind = 'shared_challenge' then
    insert into public.challenges(couple_id, created_by, name, description, metric, target, mode, consecutive, start_date, end_date, badge, reward)
    values (pr.couple_id, pr.proposed_by, p->>'name', p->>'description', p->>'metric', (p->>'target')::numeric,
            coalesce(p->>'mode','each'), coalesce((p->>'consecutive')::boolean, false),
            coalesce((p->>'start_date')::date, current_date), (p->>'end_date')::date, coalesce(nullif(p->>'badge',''), '🔥'), p->>'reward')
    returning id into new_id;
    return jsonb_build_object('challenge_id', new_id);
  elsif pr.kind = 'shared_challenge_cancel' then
    update public.challenges set status = 'cancelled' where id = (p->>'challenge_id')::uuid and couple_id = pr.couple_id;
    return p;
  elsif pr.kind = 'streak_recovery' then
    update public.streak_days set status = 'recovered' where couple_id = pr.couple_id and day = (p->>'day')::date;
    perform private.recompute_streak(pr.couple_id);
    return p;
  end if;
  raise exception 'Tipo no soportado';
end;
$$;

create or replace function public.respond_proposal(p_id uuid, p_approve boolean, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pr public.shared_change_proposals;
  res jsonb;
begin
  select * into pr from public.shared_change_proposals where id = p_id for update;
  if pr.id is null or not private.is_member(pr.couple_id) then raise exception 'Propuesta no encontrada'; end if;
  if pr.status <> 'pending' then raise exception 'Esta propuesta ya fue resuelta'; end if;
  if pr.proposed_by = me then raise exception 'No puedes aprobar tu propia propuesta: debe hacerlo tu pareja'; end if;

  insert into public.shared_change_approvals(proposal_id, user_id, decision, comment)
  values (p_id, me, case when p_approve then 'approved' else 'rejected' end, left(p_comment, 300));

  if p_approve then
    res := private.apply_proposal(pr, me);
    update public.shared_change_proposals set status = 'approved', resolved_at = now(), resolved_by = me, result = res where id = p_id;
    perform private.audit(pr.couple_id, me, 'proposal_approved', jsonb_build_object('proposal_id', p_id, 'kind', pr.kind, 'result', res, 'proposed_by', pr.proposed_by));
    perform private.notify(pr.proposed_by, 'proposals', '✅ Cambio aprobado', pr.title, jsonb_build_object('proposal_id', p_id));
  else
    update public.shared_change_proposals set status = 'rejected', resolved_at = now(), resolved_by = me where id = p_id;
    perform private.audit(pr.couple_id, me, 'proposal_rejected', jsonb_build_object('proposal_id', p_id, 'kind', pr.kind, 'proposed_by', pr.proposed_by));
    perform private.notify(pr.proposed_by, 'proposals', '❌ Cambio rechazado', pr.title || coalesce(' · ' || p_comment, ''), jsonb_build_object('proposal_id', p_id));
  end if;
  return coalesce(res, '{}'::jsonb);
end;
$$;

create or replace function public.cancel_proposal(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pr public.shared_change_proposals;
begin
  select * into pr from public.shared_change_proposals where id = p_id for update;
  if pr.id is null or pr.proposed_by <> auth.uid() then raise exception 'Propuesta no encontrada'; end if;
  if pr.status <> 'pending' then raise exception 'Esta propuesta ya fue resuelta'; end if;
  update public.shared_change_proposals set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid() where id = p_id;
  perform private.audit(pr.couple_id, auth.uid(), 'proposal_cancelled', jsonb_build_object('proposal_id', p_id));
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

create or replace function public.mark_messages_read()
returns void language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where couple_id = private.my_couple() and sender_id <> auth.uid() and read_at is null;
$$;

-- Historial de rachas (tramos)
create or replace function public.streak_runs()
returns table(start_day date, end_day date, length int)
language sql stable security definer set search_path = '' as $$
  with s as (
    select day, status, sum(case when status = 'missed' then 1 else 0 end) over (order by day) grp
    from public.streak_days where couple_id = private.my_couple()
  )
  select min(day) filter (where status = 'completed'), max(day) filter (where status = 'completed'),
         (count(*) filter (where status = 'completed'))::int
  from s group by grp
  having count(*) filter (where status = 'completed') > 0
  order by 1 desc;
$$;

-- Progreso de una meta (visible para su dueño o para la pareja si es compartida)
create or replace function public.goal_progress(p_goal uuid)
returns table(user_id uuid, value numeric, target numeric, period_from date, period_to date)
language plpgsql stable security definer set search_path = '' as $$
declare g record; per record; m uuid;
begin
  select * into g from public.goals where id = p_goal;
  if g is null or not (g.user_id = auth.uid() or private.is_member(g.couple_id)) then raise exception 'Meta no encontrada'; end if;
  select * into per from private.goal_period(g.frequency, private.user_today(auth.uid()), g.start_date, g.end_date);
  for m in select auth.uid() where g.couple_id is null union select x from private.members(g.couple_id) x where g.couple_id is not null loop
    user_id := m; target := g.target; period_from := per.from_day; period_to := per.to_day;
    value := case when g.metric = 'manual' then g.manual_progress else private.metric_value(m, g.metric, per.from_day, per.to_day) end;
    return next;
  end loop;
end;
$$;

create or replace function public.challenge_progress(p_challenge uuid)
returns table(user_id uuid, value numeric)
language plpgsql stable security definer set search_path = '' as $$
declare ch record; m uuid;
begin
  select * into ch from public.challenges where id = p_challenge;
  if ch is null or not (ch.user_id = auth.uid() or private.is_member(ch.couple_id)) then raise exception 'Reto no encontrado'; end if;
  for m in select auth.uid() where ch.couple_id is null union select x from private.members(ch.couple_id) x where ch.couple_id is not null loop
    user_id := m;
    value := private.metric_value(m, ch.metric, ch.start_date, ch.end_date, ch.consecutive);
    return next;
  end loop;
end;
$$;

-- Estadísticas agregadas (solo totales, nunca registros en bruto de la pareja)
create or replace function public.couple_stats(p_from date, p_to date)
returns table(user_id uuid, workouts int, workout_minutes int, activity_minutes int, steps int, water_ml int, habit_checks int, completed_days int, rest_days int)
language plpgsql stable security definer set search_path = '' as $$
declare m uuid; c uuid := private.my_couple();
begin
  if p_to - p_from > 400 then raise exception 'Rango demasiado grande'; end if;
  for m in select auth.uid() where c is null union select x from private.members(c) x where c is not null loop
    user_id := m;
    select count(*), coalesce(sum(duration_min),0) into workouts, workout_minutes from public.workouts w where w.user_id = m and w.local_day between p_from and p_to;
    select coalesce(sum(minutes),0), coalesce(sum(a.steps),0) into activity_minutes, steps from public.activity_logs a where a.user_id = m and a.local_day between p_from and p_to;
    select greatest(coalesce(sum(amount_ml),0),0) into water_ml from public.water_logs wl where wl.user_id = m and wl.local_day between p_from and p_to;
    select count(*) into habit_checks from public.habit_logs hl where hl.user_id = m and hl.local_day between p_from and p_to;
    select count(*) filter (where status = 'completed'), count(*) filter (where status = 'rest') into completed_days, rest_days
      from public.member_day_status mds where mds.user_id = m and mds.couple_id = c and mds.day between p_from and p_to;
    return next;
  end loop;
end;
$$;

-- Serie diaria por persona (para gráficos)
create or replace function public.daily_series(p_from date, p_to date)
returns table(user_id uuid, day date, workouts int, activity_minutes int, steps int, water_ml int, habit_checks int)
language plpgsql stable security definer set search_path = '' as $$
declare c uuid := private.my_couple();
begin
  if p_to - p_from > 400 then raise exception 'Rango demasiado grande'; end if;
  return query
  with mem as (select auth.uid() u where c is null union select x from private.members(c) x where c is not null),
  days as (select generate_series(p_from, p_to, interval '1 day')::date d)
  select mem.u, days.d,
    (select count(*)::int from public.workouts w where w.user_id = mem.u and w.local_day = days.d),
    (select coalesce(sum(minutes),0)::int from public.activity_logs a where a.user_id = mem.u and a.local_day = days.d),
    (select coalesce(sum(a.steps),0)::int from public.activity_logs a where a.user_id = mem.u and a.local_day = days.d),
    (select greatest(coalesce(sum(amount_ml),0),0)::int from public.water_logs wl where wl.user_id = mem.u and wl.local_day = days.d),
    (select count(*)::int from public.habit_logs hl where hl.user_id = mem.u and hl.local_day = days.d)
  from mem cross join days order by days.d;
end;
$$;

-- ---------------------------------------------------------------------
-- Recordatorios programados (los ejecuta pg_cron cada 15 minutos)
-- ---------------------------------------------------------------------
create or replace function private.pref(p jsonb, k text, f text, dflt text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(p->k->>f, dflt);
$$;

create or replace function private.in_window(p_local timestamp, p_time text, p_minutes int default 20)
returns boolean language sql immutable set search_path = '' as $$
  select p_local::time >= p_time::time and p_local::time < (p_time::time + make_interval(mins => p_minutes));
$$;

create or replace function private.enqueue_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  pr record;
  lt timestamp;
  d date;
  c uuid;
  p jsonb;
  n int := 0;
  v int;
  st text;
  pst text;
  every int; from_t time; to_t time; mins int;
  ev record;
begin
  for pr in select * from public.profiles loop
    p := pr.notification_prefs;
    lt := p_now at time zone pr.timezone;
    d := private.local_day_for(pr.id, p_now);
    c := private.active_couple(pr.id);

    -- Entrenamiento
    if private.pref(p,'workout','enabled','true') = 'true' and private.in_window(lt, private.pref(p,'workout','time','18:00')) then
      select count(*) into v from public.workouts where user_id = pr.id and local_day = d;
      if v = 0 then
        perform private.notify(pr.id, 'workout', '🏋️ ¿Entrenamos hoy?', 'Todavía no registraste tu entrenamiento.', '{}'::jsonb, 'r_workout:' || d);
        n := n + 1;
      end if;
    end if;

    -- Agua (cada N horas entre "desde" y "hasta")
    if private.pref(p,'water','enabled','true') = 'true' then
      every := greatest(1, private.pref(p,'water','every_hours','2')::int);
      from_t := private.pref(p,'water','from','10:00')::time;
      to_t := private.pref(p,'water','to','20:00')::time;
      if lt::time between from_t and to_t then
        mins := (extract(epoch from (lt::time - from_t)) / 60)::int;
        if mins % (every * 60) < 20 then
          select greatest(coalesce(sum(amount_ml),0),0) into v from public.water_logs where user_id = pr.id and local_day = d;
          if v < pr.water_goal_ml then
            perform private.notify(pr.id, 'water', '💧 Hora de tomar agua',
              'Llevas ' || round(v/1000.0, 2) || ' L de ' || round(pr.water_goal_ml/1000.0, 2) || ' L.', '{}'::jsonb,
              'r_water:' || d || ':' || (mins / (every * 60)));
            n := n + 1;
          end if;
        end if;
      end if;
    end if;

    -- Hábitos pendientes
    if private.pref(p,'habits','enabled','true') = 'true' and private.in_window(lt, private.pref(p,'habits','time','20:30')) then
      select count(*) into v from public.habits h where h.user_id = pr.id and not h.archived and h.frequency = 'daily'
        and h.start_date <= d and (h.end_date is null or h.end_date >= d)
        and not exists (select 1 from public.habit_logs hl where hl.habit_id = h.id and hl.local_day = d);
      if v > 0 then
        perform private.notify(pr.id, 'habits', '✅ Hábitos pendientes', 'Te quedan ' || v || ' hábito(s) por marcar hoy.', '{}'::jsonb, 'r_habits:' || d);
        n := n + 1;
      end if;
    end if;

    -- Racha en peligro
    if c is not null and private.pref(p,'streak_risk','enabled','true') = 'true' and private.in_window(lt, private.pref(p,'streak_risk','time','21:00')) then
      select status into st from public.member_day_status where couple_id = c and user_id = pr.id and day = d;
      select status into pst from public.member_day_status where couple_id = c and user_id = private.partner_of(pr.id) and day = d;
      if coalesce(st,'pending') not in ('completed','rest') then
        perform private.notify(pr.id, 'streak_risk', '🔥 ¡La racha está en peligro!', 'Aún no cumpliste lo de hoy. ¡No dejes que se apague!', '{}'::jsonb, 'r_risk:' || d);
        n := n + 1;
      elsif coalesce(pst,'pending') not in ('completed','rest') then
        perform private.notify(pr.id, 'streak_risk', '💌 Tu pareja aún no cumplió', 'Mándale un mensaje de ánimo para salvar la racha.', '{}'::jsonb, 'r_risk_partner:' || d);
        n := n + 1;
      end if;
    end if;

    -- Fechas importantes
    if c is not null and private.pref(p,'dates','enabled','true') = 'true' and private.in_window(lt, private.pref(p,'dates','time','09:00')) then
      for ev in select * from public.calendar_events e where e.couple_id = c and
          (e.event_date = d or (e.yearly and extract(month from e.event_date) = extract(month from d) and extract(day from e.event_date) = extract(day from d))) loop
        perform private.notify(pr.id, 'dates', '📅 Hoy: ' || ev.title, coalesce(ev.notes, ''), jsonb_build_object('event_id', ev.id), 'r_event:' || ev.id || ':' || d);
        n := n + 1;
      end loop;
      if exists (select 1 from public.couples cp where cp.id = c and cp.anniversary_date is not null
                 and extract(month from cp.anniversary_date) = extract(month from d) and extract(day from cp.anniversary_date) = extract(day from d)) then
        perform private.notify(pr.id, 'dates', '💞 ¡Feliz aniversario!', 'Hoy es un día especial para ustedes.', '{}'::jsonb, 'r_anniv:' || d);
      end if;
      if exists (select 1 from public.profiles pp where pp.id = private.partner_of(pr.id) and pp.birthday is not null
                 and extract(month from pp.birthday) = extract(month from d) and extract(day from pp.birthday) = extract(day from d)) then
        perform private.notify(pr.id, 'dates', '🎂 ¡Hoy cumple años tu pareja!', 'No olvides saludarle.', '{}'::jsonb, 'r_bday:' || d);
      end if;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function private.expire_challenges()
returns void language sql security definer set search_path = '' as $$
  update public.challenges set status = 'failed' where status = 'active' and end_date < current_date - 1;
$$;

create or replace function private.cron_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.finalize_all(now());
  perform private.enqueue_reminders(now());
  perform private.expire_challenges();
end;
$$;

-- ---------------------------------------------------------------------
-- Envío push: cuando se crea una notificación, se avisa a la función
-- /api/push de Vercel (si está configurada en private.app_settings).
-- ---------------------------------------------------------------------
create or replace function private.tg_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  url text := (select value from private.app_settings where key = 'push_url');
  secret text := (select value from private.app_settings where key = 'push_secret');
begin
  if url is null or secret is null then return null; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then return null; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using url, jsonb_build_object('notification_id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret);
  exception when others then
    null; -- nunca romper la operación principal por un fallo de push
  end;
  return null;
end;
$$;
drop trigger if exists tg_push on public.notifications;
create trigger tg_push after insert on public.notifications for each row execute function private.tg_notification_push();

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke all on schema private from public;
revoke execute on all functions in schema private from public;
grant usage on schema private to authenticated;
-- Solo los ayudantes que usan las políticas RLS
grant execute on function private.my_couple() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_partner(uuid) to authenticated;
grant execute on function private.partner_of(uuid) to authenticated;
grant execute on function private.active_couple(uuid) to authenticated;

revoke execute on function public.create_invitation() from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.unlink_couple() from public, anon;
revoke execute on function public.refresh_today() from public, anon;
revoke execute on function public.my_today() from public, anon;
revoke execute on function public.propose_change(text, text, jsonb) from public, anon;
revoke execute on function public.respond_proposal(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_proposal(uuid) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.mark_messages_read() from public, anon;
revoke execute on function public.streak_runs() from public, anon;
revoke execute on function public.goal_progress(uuid) from public, anon;
revoke execute on function public.challenge_progress(uuid) from public, anon;
revoke execute on function public.couple_stats(date, date) from public, anon;
revoke execute on function public.daily_series(date, date) from public, anon;

grant execute on function public.create_invitation() to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.unlink_couple() to authenticated;
grant execute on function public.refresh_today() to authenticated;
grant execute on function public.my_today() to authenticated;
grant execute on function public.propose_change(text, text, jsonb) to authenticated;
grant execute on function public.respond_proposal(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_proposal(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_messages_read() to authenticated;
grant execute on function public.streak_runs() to authenticated;
grant execute on function public.goal_progress(uuid) to authenticated;
grant execute on function public.challenge_progress(uuid) to authenticated;
grant execute on function public.couple_stats(date, date) to authenticated;
grant execute on function public.daily_series(date, date) to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 0003_rls.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0003 · Seguridad a nivel de fila (RLS) y Realtime
-- =====================================================================

-- Activar RLS en TODAS las tablas públicas
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Permisos base: anon no ve nada; authenticated pasa por RLS
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tablas que SOLO escribe el servidor (defensa extra además de RLS)
revoke insert, update, delete on public.couples, public.couple_members, public.invitations,
  public.streak_rules, public.member_day_status, public.streak_days, public.streaks,
  public.notifications, public.shared_change_proposals, public.shared_change_approvals,
  public.audit_logs, public.user_badges from authenticated;
grant delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- Helpers para borrar políticas antiguas al re-ejecutar
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfiles: me veo a mí y a mi pareja; solo edito el mío
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_partner(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Pareja y racha: solo miembros activos (lectura). Escritura: servidor.
-- ---------------------------------------------------------------------
create policy couples_select on public.couples for select to authenticated using (private.is_member(id));
create policy couple_members_select on public.couple_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));
create policy invitations_select on public.invitations for select to authenticated using (inviter_id = (select auth.uid()));
create policy streak_rules_select on public.streak_rules for select to authenticated using (private.is_member(couple_id));
create policy mds_select on public.member_day_status for select to authenticated using (private.is_member(couple_id));
create policy streak_days_select on public.streak_days for select to authenticated using (private.is_member(couple_id));
create policy streaks_select on public.streaks for select to authenticated using (private.is_member(couple_id));
create policy proposals_select on public.shared_change_proposals for select to authenticated using (private.is_member(couple_id));
create policy approvals_select on public.shared_change_approvals for select to authenticated
  using (exists (select 1 from public.shared_change_proposals p where p.id = proposal_id and private.is_member(p.couple_id)));
create policy audit_select on public.audit_logs for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));

-- ---------------------------------------------------------------------
-- Datos personales: cada quien lo suyo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['exercises','routines','workouts','water_logs','water_presets','activity_logs','categories','habits','push_subscriptions'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete', t);
  end loop;
end $$;

-- Hijos de rutinas / entrenamientos
create policy routine_ex_all on public.routine_exercises for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy workout_sets_all on public.workout_sets for all to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())));

-- Hábitos: registro propio (sin edición, solo marcar/desmarcar)
create policy habit_logs_select on public.habit_logs for select to authenticated using (user_id = (select auth.uid()));
create policy habit_logs_insert on public.habit_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy habit_logs_delete on public.habit_logs for delete to authenticated using (user_id = (select auth.uid()));

-- Descansos: los veo yo y mi pareja; solo los creo/borro yo
create policy rest_days_select on public.rest_days for select to authenticated
  using (user_id = (select auth.uid()) or private.is_partner(user_id));
create policy rest_days_insert on public.rest_days for insert to authenticated with check (user_id = (select auth.uid()));
create policy rest_days_delete on public.rest_days for delete to authenticated using (user_id = (select auth.uid()));

-- Metas y retos: personales editables; compartidos solo por propuesta
create policy goals_select on public.goals for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));
create policy goals_insert on public.goals for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id is null and created_by = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and couple_id is null);
create policy goals_delete on public.goals for delete to authenticated using (user_id = (select auth.uid()));

create policy challenges_select on public.challenges for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));
create policy challenges_insert on public.challenges for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id is null and created_by = (select auth.uid()));
create policy challenges_update on public.challenges for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and couple_id is null);
create policy challenges_delete on public.challenges for delete to authenticated using (user_id = (select auth.uid()));

create policy badges_select on public.user_badges for select to authenticated
  using (user_id = (select auth.uid()) or private.is_partner(user_id));

-- ---------------------------------------------------------------------
-- Espacio de pareja: ambos ven; cada quien edita/borra lo suyo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['calendar_events','memories','notes'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(couple_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_member(couple_id) and created_by = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (created_by = (select auth.uid()) and private.is_member(couple_id)) with check (created_by = (select auth.uid()) and private.is_member(couple_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (created_by = (select auth.uid()) and private.is_member(couple_id))', t || '_delete', t);
  end loop;
end $$;

create policy messages_select on public.messages for select to authenticated using (private.is_member(couple_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (private.is_member(couple_id) and sender_id = (select auth.uid()));
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) and private.is_member(couple_id));
revoke update on public.messages from authenticated;

-- Notificaciones: solo las mías
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Realtime: tablas que se sincronizan al instante entre los dos
-- (Realtime respeta las políticas RLS de arriba)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['member_day_status','streak_days','streaks','messages','notifications','shared_change_proposals',
                           'couples','couple_members','calendar_events','memories','notes','streak_rules','rest_days','goals','challenges','profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- >>>>>>>>>>>>>>>>>>>> 0004_storage.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0004 · Almacenamiento de fotos (privado)
-- Rutas:  users/<user_id>/...      → foto de perfil (la ven tú y tu pareja)
--         couples/<couple_id>/...  → álbum, recuerdos, fotos del chat
-- Límite por archivo: 5 MB (la app comprime las fotos antes de subir).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists media_select on storage.objects;
drop policy if exists media_insert on storage.objects;
drop policy if exists media_update on storage.objects;
drop policy if exists media_delete on storage.objects;

create policy media_select on storage.objects for select to authenticated using (
  bucket_id = 'media' and (
    ((storage.foldername(name))[1] = 'users' and ((storage.foldername(name))[2] = (select auth.uid())::text
        or private.is_partner(((storage.foldername(name))[2])::uuid)))
    or ((storage.foldername(name))[1] = 'couples' and private.is_member(((storage.foldername(name))[2])::uuid))
  ));

create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (
    ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'couples' and private.is_member(((storage.foldername(name))[2])::uuid))
  ));

create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'media' and owner_id = (select auth.uid())::text);

create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text);


-- >>>>>>>>>>>>>>>>>>>> 0005_cron.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0006_levels.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0007_body_weight.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0007 · Peso corporal (privado de cada persona)
-- =====================================================================
create table if not exists public.body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  weight_kg numeric(5,2) not null check (weight_kg between 20 and 400),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.body_weights enable row level security;
grant select, insert, update, delete on public.body_weights to authenticated;
drop policy if exists body_weights_select on public.body_weights;
drop policy if exists body_weights_insert on public.body_weights;
drop policy if exists body_weights_update on public.body_weights;
drop policy if exists body_weights_delete on public.body_weights;
create policy body_weights_select on public.body_weights for select to authenticated using (user_id = (select auth.uid()));
create policy body_weights_insert on public.body_weights for insert to authenticated with check (user_id = (select auth.uid()));
create policy body_weights_update on public.body_weights for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_weights_delete on public.body_weights for delete to authenticated using (user_id = (select auth.uid()));


-- >>>>>>>>>>>>>>>>>>>> 0008_character.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0008 · Apariencia del personaje de cada persona
-- (llamita o persona con piel, pelo, ropa…). La pareja la ve; solo el dueño la edita.
-- =====================================================================
alter table public.profiles add column if not exists character jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.profiles add constraint profiles_character_size check (pg_column_size(character) < 2000);
exception when duplicate_object then null; end $$;


-- >>>>>>>>>>>>>>>>>>>> 0009_body_records.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0009 · Medidas corporales, objetivo de peso y récords
-- =====================================================================
alter table public.profiles add column if not exists height_cm numeric(5,1) check (height_cm between 100 and 250);
alter table public.profiles add column if not exists goal_weight_kg numeric(5,2) check (goal_weight_kg between 30 and 300);
alter table public.profiles add column if not exists start_weight_kg numeric(5,2) check (start_weight_kg between 20 and 400);

-- Récords personales (carrera, peso corporal, fuerza manual, etc.).
-- Los ve su dueño y su pareja (para motivarse); solo el dueño los crea/borra.
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (char_length(kind) between 1 and 40),
  label text not null check (char_length(label) between 1 and 60),
  value numeric not null check (value > 0),
  unit text not null check (unit in ('s', 'reps', 'kg', 'km', 'm', 'min')),
  better text not null default 'higher' check (better in ('higher', 'lower')),
  achieved_on date not null default current_date,
  notes text check (char_length(notes) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists records_user_kind on public.records(user_id, kind, achieved_on desc);

alter table public.records enable row level security;
grant select, insert, update, delete on public.records to authenticated;
drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
drop policy if exists records_delete on public.records;
create policy records_select on public.records for select to authenticated
  using (user_id = (select auth.uid()) or private.is_partner(user_id));
create policy records_insert on public.records for insert to authenticated with check (user_id = (select auth.uid()));
create policy records_update on public.records for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy records_delete on public.records for delete to authenticated using (user_id = (select auth.uid()));

-- Aviso a la pareja cuando alguien bate un récord
create or replace function private.tg_record_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prev numeric;
begin
  select case when new.better = 'lower' then min(value) else max(value) end into prev
  from public.records where user_id = new.user_id and kind = new.kind and id <> new.id;
  if prev is null or (new.better = 'lower' and new.value < prev) or (new.better = 'higher' and new.value > prev) then
    perform private.notify(private.partner_of(new.user_id), 'partner_activity',
      '🏅 ' || private.display_name(new.user_id) || ' batió su récord', new.label, jsonb_build_object('record_id', new.id), 'record:' || new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists tg_after on public.records;
create trigger tg_after after insert on public.records for each row execute function private.tg_record_after();
revoke execute on function private.tg_record_after() from public;


-- >>>>>>>>>>>>>>>>>>>> 0010_weekly.sql <<<<<<<<<<<<<<<<<<<<
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
    body := format('Tú: %s entrenos, %s min de actividad, +%s XP.', t.workouts, t.activity_minutes, t.xp);
    if c is not null and private.partner_of(pr.id) is not null then
      body := body || format(' Juntos: %s días de racha esta semana. ¡Mira el resumen! 🔥', t.couple_days);
    end if;
    perform private.notify(pr.id, 'weekly', '📊 Su semana en Fuego Juntos', body,
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

