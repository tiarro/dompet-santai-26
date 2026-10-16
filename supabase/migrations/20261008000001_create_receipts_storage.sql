begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 524288, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_owner_select on storage.objects;
create policy receipts_owner_select on storage.objects for select to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists receipts_owner_insert on storage.objects;
create policy receipts_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists receipts_owner_update on storage.objects;
create policy receipts_owner_update on storage.objects for update to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists receipts_owner_delete on storage.objects;
create policy receipts_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
