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
