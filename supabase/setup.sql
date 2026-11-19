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


-- >>>>>>>>>>>>>>>>>>>> 0011_life.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0012_private_photos.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0012 · Fotos de progreso privadas
-- Rutas private/<user_id>/...  → SOLO las ve su dueño (ni la pareja).
-- (Repite las políticas de 0004 añadiendo la carpeta privada.)
-- =====================================================================
drop policy if exists media_select on storage.objects;
drop policy if exists media_insert on storage.objects;

create policy media_select on storage.objects for select to authenticated using (
  bucket_id = 'media' and (
    ((storage.foldername(name))[1] = 'users' and ((storage.foldername(name))[2] = (select auth.uid())::text
        or private.is_partner(((storage.foldername(name))[2])::uuid)))
    or ((storage.foldername(name))[1] = 'couples' and private.is_member(((storage.foldername(name))[2])::uuid))
    or ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = (select auth.uid())::text)
  ));

create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (
    ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'couples' and private.is_member(((storage.foldername(name))[2])::uuid))
    or ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = (select auth.uid())::text)
  ));


-- >>>>>>>>>>>>>>>>>>>> 0013_cycle.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0013 · Ciclo menstrual completo (opcional y privado)
-- - Registro diario: flujo, cólicos y síntomas (solo su dueña los ve; la
--   pareja ve un resumen SOLO si ella lo decide).
-- - Predicción del próximo período con el promedio de sus ciclos.
-- - Regla opcional de la pareja: los primeros días del período cuentan como
--   "día de mínimos" (como toda regla, la aprueban los dos y rige desde mañana).
-- - Aviso privado 2 días antes del próximo período.
-- =====================================================================
alter table public.cycle_settings add column if not exists share_symptoms boolean not null default false;
alter table public.cycle_settings add column if not exists remind boolean not null default true;

create table if not exists public.cycle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  flow smallint check (flow between 0 and 4),          -- 0 nada · 1 manchado · 2 ligero · 3 medio · 4 abundante
  pain smallint check (pain between 0 and 3),          -- cólicos: 0 nada · 1 leves · 2 moderados · 3 fuertes
  symptoms text[] not null default '{}' check (symptoms <@ array['hinchazon','cabeza','antojos','pechos','acne','espalda','nauseas','cansancio','irritable','ansiedad','tristeza','sensible','insomnio','energia_alta','animo_alto']::text[]),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.cycle_logs enable row level security;
grant select, insert, update, delete on public.cycle_logs to authenticated;
drop policy if exists cycle_logs_own on public.cycle_logs;
create policy cycle_logs_own on public.cycle_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function private.tg_cycle_period_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.start_date > private.user_today(new.user_id) then raise exception 'El período no puede empezar en el futuro'; end if;
    if exists (select 1 from public.cycle_periods p where p.user_id = new.user_id and abs(p.start_date - new.start_date) < 10) then
      raise exception 'Ya hay un período registrado en esas fechas';
    end if;
  else
    new.created_at := old.created_at; new.user_id := old.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists tg_before on public.cycle_periods;
create trigger tg_before before insert or update on public.cycle_periods for each row execute function private.tg_cycle_period_before();
create or replace function private.tg_cycle_period_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid := coalesce(new.user_id, old.user_id);
begin
  perform private.refresh_member_day(u, private.user_today(u));
  return null;
end;
$$;
drop trigger if exists tg_after on public.cycle_periods;
create trigger tg_after after insert or update or delete on public.cycle_periods for each row execute function private.tg_cycle_period_after();

-- Promedios reales de sus ciclos (últimos 6) y próximo período estimado
create or replace function private.cycle_stats(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; avg_c numeric; avg_p numeric; last date; n int;
begin
  select * into s from public.cycle_settings where user_id = p_uid;
  if not found or not s.enabled then return null; end if;
  with p as (select start_date, end_date, lead(start_date) over (order by start_date) nxt from public.cycle_periods where user_id = p_uid order by start_date desc limit 7)
  select avg(nxt - start_date) filter (where nxt is not null and nxt - start_date between 18 and 50),
         avg(end_date - start_date + 1) filter (where end_date is not null), count(*)
    into avg_c, avg_p, n from p;
  select max(start_date) into last from public.cycle_periods where user_id = p_uid;
  avg_c := coalesce(round(avg_c), s.cycle_length);
  avg_p := coalesce(round(avg_p), s.period_length);
  return jsonb_build_object('avg_cycle', avg_c, 'avg_period', avg_p, 'periods', n, 'last_start', last,
    'next_start', case when last is not null then last + avg_c::int end);
end;
$$;

-- Fase de un día usando SUS promedios
create or replace function private.cycle_phase(p_uid uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st jsonb := private.cycle_stats(p_uid); last date; cur record; len int; plen int; dd int; ovu int; nxt date;
begin
  if st is null then return null; end if;
  select * into cur from public.cycle_periods where user_id = p_uid and start_date <= p_day order by start_date desc limit 1;
  if not found then return null; end if;
  last := cur.start_date;
  len := (st->>'avg_cycle')::int; plen := coalesce(cur.end_date - cur.start_date + 1, (st->>'avg_period')::int);
  dd := ((p_day - last) % len) + 1;
  ovu := len - 14;                                    -- la ovulación suele ser ~14 días antes del próximo período
  nxt := last + ((p_day - last) / len + 1) * len;
  return jsonb_build_object('day', dd, 'length', len, 'period_length', plen,
    'phase', case when dd <= plen then 'menstrual' when dd < ovu - 1 then 'folicular' when dd <= ovu + 1 then 'ovulatoria' else 'lutea' end,
    'pms', dd > len - 5, 'next_start', nxt, 'days_to_next', nxt - p_day, 'avg_period', (st->>'avg_period')::int, 'periods', (st->>'periods')::int);
end;
$$;

create or replace function public.my_cycle()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d date := private.user_today(auth.uid()); r jsonb := private.cycle_phase(auth.uid(), d); l record;
begin
  if r is null then return null; end if;
  select * into l from public.cycle_logs where user_id = auth.uid() and day = d;
  return r || jsonb_build_object('today_log', case when not found then null else jsonb_build_object('flow', l.flow, 'pain', l.pain, 'symptoms', l.symptoms) end);
end;
$$;

-- Lo que ve la pareja: la fase (si la comparte) y un resumen de hoy (si comparte síntomas). Nunca fechas ni historial.
create or replace function public.partner_cycle()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p uuid := private.partner_of(auth.uid()); s record; ph jsonb; l record; d date;
begin
  if p is null then return null; end if;
  select * into s from public.cycle_settings where user_id = p;
  if not found or not s.enabled or not s.share_phase then return null; end if;
  d := private.user_today(p);
  ph := private.cycle_phase(p, d);
  if ph is null then return null; end if;
  ph := jsonb_build_object('phase', ph->>'phase', 'day', ph->'day', 'pms', ph->'pms');
  if s.share_symptoms then
    select * into l from public.cycle_logs where user_id = p and day = d;
    if found then ph := ph || jsonb_build_object('pain', l.pain, 'symptoms', l.symptoms); end if;
  end if;
  return ph;
end;
$$;

-- Aviso privado: 2 días antes del próximo período (09:00 hora local)
create or replace function private.enqueue_cycle(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare s record; lt timestamp; ph jsonb; n int := 0;
begin
  for s in select cs.*, pr.timezone from public.cycle_settings cs join public.profiles pr on pr.id = cs.user_id where cs.enabled and cs.remind loop
    lt := p_now at time zone private.user_tz(s.user_id);
    if not private.in_window(lt, '09:00', 15) then continue; end if;
    ph := private.cycle_phase(s.user_id, lt::date);
    if ph is not null and (ph->>'days_to_next')::int = 2 then
      perform private.notify(s.user_id, 'cycle', '🌙 Tu período podría llegar en 2 días',
        'Ten a mano lo que necesites y date permiso de bajar la intensidad si lo pide el cuerpo 💗',
        '{}'::jsonb, 'cycle_soon:' || (ph->>'next_start'));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Reglas y motor de la racha (período = mínimos, opcional)
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
    'period_easy_days', 0,
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
    and (r->>'easy_min_minutes')::int between 1 and 60
    and (r->>'period_easy_days')::int between 0 and 5;
  if not found then raise exception 'Algún valor de las reglas está fuera de rango'; end if;

  -- normalizar tipos numéricos
  for k in select unnest(array['min_workout_minutes','min_activity_minutes','min_steps','min_water_ml','min_habit_checks','weekly_workouts_target','rest_days_per_week','day_cutoff_minutes','recovery_per_month','easy_days_per_month','easy_min_minutes','period_easy_days']) loop
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
                       and ce.created_at < private.day_end(p_uid, p_couple, p_day - 1))
          -- Primeros días del período (si las reglas de la pareja lo permiten). El inicio se marca antes del cierre.
          or (coalesce((rules->>'period_easy_days')::int, 0) > 0 and exists (
                select 1 from public.cycle_periods cp where cp.user_id = p_uid
                  and p_day between cp.start_date and cp.start_date + (coalesce((rules->>'period_easy_days')::int, 0) - 1)
                  and (cp.end_date is null or p_day <= cp.end_date)
                  and cp.created_at < end_ts));
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

create or replace function private.cron_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.finalize_all(now());
  perform private.enqueue_reminders(now());
  perform private.expire_challenges();
  perform private.enqueue_weekly(now());
  perform private.enqueue_cycle(now());
end;
$$;

revoke execute on function private.cycle_stats(uuid) from public;
revoke execute on function private.cycle_phase(uuid, date) from public;
revoke execute on function private.enqueue_cycle(timestamptz) from public;
grant execute on function public.my_cycle() to authenticated;
grant execute on function public.partner_cycle() to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 0014_more.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- FUEGO JUNTOS · 0014 · Salud automática, comida simple y borrar cuenta
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pasos y sueño automáticos desde un Atajo de iOS (Salud → la app).
-- Cada persona genera su "llave" personal; se guarda SOLO su huella (sha256).
-- ---------------------------------------------------------------------
create table if not exists public.health_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  uses int not null default 0
);
alter table public.health_tokens enable row level security;
grant select, delete on public.health_tokens to authenticated;
drop policy if exists health_tokens_own on public.health_tokens;
drop policy if exists health_tokens_del on public.health_tokens;
create policy health_tokens_own on public.health_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy health_tokens_del on public.health_tokens for delete to authenticated using (user_id = (select auth.uid()));

create or replace function private.token_hash(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- Crea (o reemplaza) la llave personal. Se muestra UNA sola vez.
create or replace function public.create_health_token()
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t text;
begin
  if me is null then raise exception 'Sin sesión'; end if;
  t := 'fj_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.health_tokens(user_id, token_hash) values (me, private.token_hash(t))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null, uses = 0;
  return t;
end;
$$;

-- Lo llama el Atajo (sin sesión). Solo escribe datos de la dueña/dueño de la llave.
create or replace function public.ingest_health(p_token text, p_steps int default null, p_sleep_hours numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid;
  d date;
  a record;
begin
  if p_token is null or char_length(p_token) < 20 then raise exception 'Llave no válida'; end if;
  select user_id into u from public.health_tokens where token_hash = private.token_hash(p_token);
  if u is null then raise exception 'Llave no válida'; end if;
  update public.health_tokens set last_used_at = now(), uses = uses + 1 where user_id = u
    and (last_used_at is null or last_used_at < now() - interval '20 seconds');
  if not found then raise exception 'Demasiadas solicitudes: espera unos segundos'; end if;
  d := private.user_today(u);
  if p_steps is not null then
    if p_steps < 0 or p_steps > 200000 then raise exception 'Pasos fuera de rango'; end if;
    select * into a from public.activity_logs where user_id = u and local_day = d and kind = 'pasos' and notes = 'Salud (automático)' limit 1;
    if found then
      if p_steps > a.steps then update public.activity_logs set steps = p_steps where id = a.id; end if;
    else
      insert into public.activity_logs(user_id, kind, minutes, steps, notes, performed_at) values (u, 'pasos', 0, p_steps, 'Salud (automático)', now());
    end if;
  end if;
  if p_sleep_hours is not null then
    if p_sleep_hours < 0 or p_sleep_hours > 16 then raise exception 'Horas de sueño fuera de rango'; end if;
    insert into public.checkins(user_id, day, sleep_hours) values (u, d, round(p_sleep_hours, 1))
    on conflict (user_id, day) do update set sleep_hours = excluded.sleep_hours;
  end if;
  return jsonb_build_object('ok', true, 'day', d, 'steps', p_steps, 'sleep_hours', p_sleep_hours);
end;
$$;
revoke execute on function public.ingest_health(text, int, numeric) from public;
grant execute on function public.ingest_health(text, int, numeric) to anon, authenticated;
revoke execute on function public.create_health_token() from public, anon;
grant execute on function public.create_health_token() to authenticated;
revoke execute on function private.token_hash(text) from public;

-- ---------------------------------------------------------------------
-- Comida simple: proteína (g) y porciones de fruta/verdura. Privado.
-- ---------------------------------------------------------------------
create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null,
  kind text not null check (kind in ('protein', 'produce')),
  amount numeric(6,1) not null check (amount > 0 and amount <= 300),
  label text check (char_length(label) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists nutrition_logs_user_day on public.nutrition_logs(user_id, day);
alter table public.nutrition_logs enable row level security;
grant select, insert, update, delete on public.nutrition_logs to authenticated;
drop policy if exists nutrition_logs_own on public.nutrition_logs;
create policy nutrition_logs_own on public.nutrition_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function private.tg_nutrition_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); else new.user_id := old.user_id; new.created_at := old.created_at; end if;
  if new.day > private.user_today(new.user_id) or new.day < private.user_today(new.user_id) - 7 then raise exception 'Solo puedes registrar la última semana'; end if;
  return new;
end;
$$;
drop trigger if exists tg_before on public.nutrition_logs;
create trigger tg_before before insert or update on public.nutrition_logs for each row execute function private.tg_nutrition_before();

-- ---------------------------------------------------------------------
-- Borrar mi cuenta (con confirmación escrita). Desvincula, borra lo que
-- escribió en el espacio compartido y luego la cuenta con todos sus datos.
-- ---------------------------------------------------------------------
-- Los bloqueos de "no borrar días pasados" se levantan SOLO durante el borrado de la cuenta
create or replace function private.tg_rest_day_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- al borrar la cuenta completa se permite borrar todo
  if tg_op = 'DELETE' and coalesce(current_setting('fj.deleting', true), '') = '1' then return old; end if;
  if old.day < private.user_today(old.user_id) then
    raise exception 'No puedes quitar un descanso de un día pasado';
  end if;
  return old;
end;
$$;

create or replace function private.tg_habit_log_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- al borrar la cuenta completa se permite borrar todo
  if tg_op = 'DELETE' and coalesce(current_setting('fj.deleting', true), '') = '1' then return old; end if;
  if old.local_day < private.user_today(old.user_id) then
    raise exception 'Solo puedes desmarcar hábitos de hoy';
  end if;
  return old;
end;
$$;

create or replace function private.tg_easy_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  today date;
  c uuid;
  r record;
  used int;
begin
  -- al borrar la cuenta completa se permite borrar todo
  if tg_op = 'DELETE' and coalesce(current_setting('fj.deleting', true), '') = '1' then return old; end if;
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

create or replace function private.tg_pause_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare today date := private.user_today(coalesce(new.user_id, old.user_id));
begin
  -- al borrar la cuenta completa se permite borrar todo
  if tg_op = 'DELETE' and coalesce(current_setting('fj.deleting', true), '') = '1' then return old; end if;
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

create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cid uuid; p uuid;
begin
  if me is null then raise exception 'Sin sesión'; end if;
  if p_confirm is distinct from 'BORRAR' then raise exception 'Escribe BORRAR para confirmar'; end if;
  perform set_config('fj.deleting', '1', true);
  cid := private.active_couple(me);
  if cid is not null then
    p := private.partner_of(me);
    update public.couples set status = 'ended', ended_at = now(), ended_by = null where id = cid;
    update public.couple_members set left_at = now() where couple_id = cid and left_at is null;
    update public.shared_change_proposals set status = 'cancelled', resolved_at = now() where couple_id = cid and status = 'pending';
    perform private.notify(p, 'couple', 'Tu pareja eliminó su cuenta', 'La vinculación terminó. Tus datos personales se conservan.');
  end if;
  update public.couples set ended_by = null where ended_by = me;
  update public.invitations set used_by = null where used_by = me;
  update public.streak_rules set proposed_by = null where proposed_by = me;
  update public.streak_rules set approved_by = null where approved_by = me;
  update public.shared_change_proposals set resolved_by = null where resolved_by = me;
  delete from public.shared_change_approvals where user_id = me;
  delete from public.shared_change_proposals where proposed_by = me;
  delete from public.messages where sender_id = me;
  delete from public.memories where created_by = me;
  delete from public.notes where created_by = me;
  delete from public.calendar_events where created_by = me;
  delete from public.challenges where created_by = me;
  delete from public.goals where created_by = me;
  delete from auth.users where id = me;
end;
$$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 0015_first_run.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- GYMAIEGO · 0015 · Bienvenida y tutorial: solo la primera vez
-- Se guarda en la cuenta (no solo en el teléfono), así no vuelve a salir al
-- iniciar sesión de nuevo, en otro dispositivo o al instalar la app.
-- =====================================================================
alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists tour_seen_at timestamptz;

-- Cuentas que ya existían (y ya vieron la bienvenida): marcarlas como vistas
update public.profiles
   set onboarded_at = coalesce(onboarded_at, created_at),
       tour_seen_at = coalesce(tour_seen_at, created_at)
 where onboarded_at is null and created_at < now() - interval '1 hour';


-- >>>>>>>>>>>>>>>>>>>> 0016_live.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0017_push.sql <<<<<<<<<<<<<<<<<<<<
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

