begin;

-- The key includes the reminder stage/date, not just the underlying record ID.
create table public.notification_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_key text not null check (octet_length(read_key) between 1 and 512),
  read_at timestamptz not null default now() check (isfinite(read_at)),
  primary key (user_id, read_key)
);
alter table public.notification_reads enable row level security;
revoke all on table public.notification_reads from public, anon, authenticated;
grant select, insert on table public.notification_reads to authenticated;
create policy notification_reads_select on public.notification_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_reads_insert on public.notification_reads
  for insert to authenticated with check (user_id = (select auth.uid()));
-- Clients insert with ON CONFLICT DO NOTHING; existing timestamps are immutable.
comment on table public.notification_reads is 'Per-account read markers by notification stage; separate from finance snapshots.';
notify pgrst, 'reload schema';
commit;
