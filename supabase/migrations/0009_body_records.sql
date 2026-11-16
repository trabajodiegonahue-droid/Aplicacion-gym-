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
