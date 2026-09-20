insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'encrypted-backups',
  'encrypted-backups',
  false,
  5242880,
  array['application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users_select_own_encrypted_backups"
on storage.objects for select
to authenticated
using (
  bucket_id = 'encrypted-backups'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_insert_own_encrypted_backups"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'encrypted-backups'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_delete_own_encrypted_backups"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'encrypted-backups'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
