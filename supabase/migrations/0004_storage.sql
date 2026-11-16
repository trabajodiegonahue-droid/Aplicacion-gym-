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
