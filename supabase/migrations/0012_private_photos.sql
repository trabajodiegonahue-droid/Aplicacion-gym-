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
