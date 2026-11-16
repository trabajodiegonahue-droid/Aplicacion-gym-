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
