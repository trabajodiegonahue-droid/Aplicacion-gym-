-- =====================================================================
-- FUEGO JUNTOS · 0008 · Apariencia del personaje de cada persona
-- (llamita o persona con piel, pelo, ropa…). La pareja la ve; solo el dueño la edita.
-- =====================================================================
alter table public.profiles add column if not exists character jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.profiles add constraint profiles_character_size check (pg_column_size(character) < 2000);
exception when duplicate_object then null; end $$;
