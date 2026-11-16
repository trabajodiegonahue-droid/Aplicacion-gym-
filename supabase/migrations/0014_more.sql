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
