begin;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (octet_length(endpoint) between 20 and 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  timezone text not null check (length(timezone) between 1 and 100),
  last_test_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy push_subscriptions_owner_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_owner_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.validate_push_timezone() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_push_timezone() from public, anon, authenticated;
create trigger push_timezone_check before insert or update on public.push_subscriptions
for each row execute function public.validate_push_timezone();

create table public.push_deliveries (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  reminder_date date not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  lease_token uuid not null default gen_random_uuid(),
  retry_at timestamptz not null default now(),
  sent_at timestamptz,
  last_status integer,
  primary key (subscription_id, reminder_date)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public, anon, authenticated;
grant all on public.push_deliveries to service_role;

-- Only the service-role worker may claim jobs. The unique key and lease make
-- overlapping cron runs and retries safe; no financial data is changed.
create function public.claim_due_note_push(p_now timestamptz default now(), p_limit integer default 100)
returns table (subscription_id uuid, user_id uuid, endpoint text, p256dh text, auth text,
  reminder_date date, lease_token uuid, expires_at timestamptz)
language sql security invoker set search_path = '' as $$
  with candidates as (
    select s.*, (p_now at time zone s.timezone)::date as local_day
    from public.push_subscriptions s
    join public.user_settings settings on settings.user_id = s.user_id
    where settings.notes_reminders
      and (p_now at time zone s.timezone)::time >= settings.reminder_time
      and not exists (select 1 from public.transactions t where t.user_id = s.user_id
        and t.occurred_on = (p_now at time zone s.timezone)::date)
      and not exists (select 1 from public.push_deliveries d where d.subscription_id = s.id
        and d.reminder_date = (p_now at time zone s.timezone)::date
        and (d.status in ('sent', 'skipped') or d.attempts >= 3 or d.retry_at > p_now))
    order by s.id
    limit greatest(1, least(p_limit, 500))
  ), claimed as (
    insert into public.push_deliveries as d (subscription_id, reminder_date, status, retry_at)
    select c.id, c.local_day, 'sending', p_now + interval '5 minutes' from candidates c
    on conflict (subscription_id, reminder_date) do update set
      status = 'sending', attempts = d.attempts + 1,
      lease_token = gen_random_uuid(), retry_at = p_now + interval '5 minutes'
    where d.status in ('sending', 'failed') and d.attempts < 3 and d.retry_at <= p_now
    returning d.subscription_id, d.reminder_date, d.lease_token
  )
  select c.id, c.user_id, c.endpoint, c.p256dh, c.auth, claimed.reminder_date, claimed.lease_token,
    (c.local_day + 1)::timestamp at time zone c.timezone
  from claimed join candidates c on c.id = claimed.subscription_id;
$$;
revoke all on function public.claim_due_note_push(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_note_push(timestamptz, integer) to service_role;

commit;
