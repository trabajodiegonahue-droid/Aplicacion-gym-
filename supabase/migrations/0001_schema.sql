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
