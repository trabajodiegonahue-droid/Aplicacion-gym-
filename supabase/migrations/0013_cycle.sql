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
