begin;

do $$
begin
  if to_regclass('public.transactions') is not null
    and to_regclass('public.transactions_legacy') is null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'user_id') then
    alter table public.transactions rename to transactions_legacy;
    alter table public.transactions_legacy enable row level security;
    revoke all on table public.transactions_legacy from anon, authenticated;
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '' check (char_length(username) <= 50),
  bio text not null default '' check (char_length(bio) <= 150),
  gender text not null default '' check (gender in ('', 'female', 'male', 'nonbinary')),
  onboarding_goal text not null default '' check (onboarding_goal in ('', 'expenses', 'budget', 'savings', 'all')),
  payday text not null default '25' check (payday = 'last' or payday ~ '^([1-9]|[12][0-9]|3[01])$'),
  onboarding_balance bigint not null default 0 check (onboarding_balance >= 0),
  onboarding_accounts jsonb not null default '[]'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  notes_reminders boolean not null default false,
  reminder_time time not null default '20:00',
  savings_reminders boolean not null default true,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code in ('cash', 'bank', 'ewallet', 'savings')),
  opening_balance bigint not null default 0 check (opening_balance >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  code text not null check (char_length(code) between 1 and 80),
  label text not null check (char_length(label) between 1 and 32),
  icon text not null check (char_length(icon) between 1 and 80),
  archived boolean not null default false,
  is_system boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, type, code)
);

create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null check (amount > 0),
  category_type text not null check (category_type in ('income', 'expense')),
  category_code text not null check (char_length(category_code) between 1 and 80),
  account_code text not null check (account_code in ('cash', 'bank', 'ewallet', 'savings')),
  occurred_on date not null,
  description text not null default '' check (char_length(description) <= 120),
  receipt_name text,
  receipt_path text,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type = category_type)
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null check (extract(day from month_start) = 1),
  category_code text not null check (char_length(category_code) between 1 and 80),
  limit_amount bigint not null check (limit_amount > 0),
  default_account text check (default_account in ('cash', 'bank', 'ewallet', 'savings')),
  updated_at timestamptz not null default now(),
  unique (user_id, month_start, category_code)
);
create index if not exists budgets_user_month_idx on public.budgets (user_id, month_start);

create table if not exists public.savings_goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target bigint not null check (target > 0),
  icon text not null,
  deadline date,
  reminder_day integer not null default 0 check (reminder_day between 0 and 31),
  archived boolean not null default false,
  deleted boolean not null default false,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.savings_movements (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  direction text not null check (direction in ('deposit', 'withdraw')),
  amount bigint not null check (amount > 0),
  account_code text not null check (account_code in ('cash', 'bank', 'ewallet')),
  movement_date date not null,
  description text not null default '' check (char_length(description) <= 120),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.savings_goals(id, user_id) on delete cascade
);
create index if not exists savings_movements_user_goal_idx on public.savings_movements (user_id, goal_id, movement_date);

create table if not exists public.finance_migrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  source_fingerprint text not null,
  status text not null check (status in ('completed', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  primary key (user_id, version)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'user_settings', 'wallets', 'categories', 'transactions', 'budgets', 'savings_goals'] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name, table_name);
  end loop;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'user_settings', 'wallets', 'categories', 'transactions', 'budgets', 'savings_goals', 'savings_movements', 'finance_migrations'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end
$$;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array['user_settings', 'wallets', 'categories', 'transactions', 'budgets', 'savings_goals', 'savings_movements', 'finance_migrations'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name || '_owner_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', table_name || '_owner_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_owner_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', table_name || '_owner_delete', table_name);
  end loop;
end
$$;

create or replace function public.lock_finance_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare owner uuid := (select auth.uid());
begin
  if owner is not null then perform pg_advisory_xact_lock(hashtextextended(owner::text, 71408)); end if;
  return null;
end;
$$;
revoke all on function public.lock_finance_owner() from public, anon, authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'user_settings', 'wallets', 'categories', 'transactions', 'budgets', 'savings_goals', 'savings_movements'] loop
    execute format('drop trigger if exists finance_owner_lock on public.%I', table_name);
    execute format('create trigger finance_owner_lock before insert or update or delete on public.%I for each statement execute function public.lock_finance_owner()', table_name);
  end loop;
end
$$;

create or replace function public.get_finance_snapshot()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare owner uuid := (select auth.uid()); snapshot jsonb;
begin
  if owner is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = owner),
    'settings', (select to_jsonb(s) from public.user_settings s where s.user_id = owner),
    'wallets', coalesce((select jsonb_agg(to_jsonb(w) order by w.code) from public.wallets w where w.user_id = owner), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.type, c.code) from public.categories c where c.user_id = owner), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_on, t.created_at, t.id) from public.transactions t where t.user_id = owner), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.month_start, b.category_code) from public.budgets b where b.user_id = owner), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at, g.id) from public.savings_goals g where g.user_id = owner), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from public.savings_movements m where m.user_id = owner), '[]'::jsonb)
  ) into snapshot;
  return snapshot || jsonb_build_object('_meta', jsonb_build_object('fingerprint', md5(snapshot::text)));
end;
$$;

create or replace function public.replace_finance_snapshot(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare owner uuid := (select auth.uid()); item jsonb; snapshot jsonb; section text;
begin
  if owner is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  -- All writes from this RPC for one account serialize before checking the version.
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 71408));
  snapshot := public.get_finance_snapshot();
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Snapshot must be an object';
  end if;
  foreach section in array array['wallets', 'categories', 'transactions', 'budgets', 'goals', 'movements'] loop
    if jsonb_typeof(payload->section) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Snapshot arrays must be supplied';
    end if;
  end loop;
  if jsonb_typeof(payload->'profile') is distinct from 'object'
    or jsonb_typeof(payload->'settings') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Profile and settings must be supplied';
  end if;
  if coalesce((payload #>> '{_meta,require_empty}')::boolean, false) then
    if snapshot->'profile' <> 'null'::jsonb or snapshot->'settings' <> 'null'::jsonb
      or exists (select 1 from unnest(array['wallets', 'categories', 'transactions', 'budgets', 'goals', 'movements']) k where jsonb_array_length(snapshot->k) > 0) then
      raise exception using errcode = '23505', message = 'Cloud is not empty; migration refused';
    end if;
  end if;
  if payload #>> '{_meta,expected_fingerprint}' is distinct from snapshot #>> '{_meta,fingerprint}' then
    raise exception using errcode = '40001', message = 'Cloud changed; reload before saving';
  end if;
  if exists (select 1 from jsonb_array_elements(payload->'transactions') t
    where nullif(t->>'receipt_path', '') is not null and
      (split_part(t->>'receipt_path', '/', 1) <> owner::text or nullif(t->>'receipt_name', '') is null)) then
    raise exception using errcode = '22023', message = 'Receipt must belong to the current owner';
  end if;
  if exists (select 1 from jsonb_array_elements(payload->'movements') m
    where not exists (select 1 from jsonb_array_elements(payload->'goals') g where g->>'id' = m->>'goal_id')) then
    raise exception using errcode = '23503', message = 'Movement goal is missing';
  end if;
  insert into public.profiles (id, username, bio, gender, onboarding_goal, payday, onboarding_balance, onboarding_accounts, onboarding_completed_at)
  values (owner, coalesce(payload #>> '{profile,username}', ''), coalesce(payload #>> '{profile,bio}', ''), coalesce(payload #>> '{profile,gender}', ''), coalesce(payload #>> '{profile,onboarding_goal}', ''), coalesce(payload #>> '{profile,payday}', '25'), coalesce((payload #>> '{profile,onboarding_balance}')::bigint, 0), coalesce(payload #> '{profile,onboarding_accounts}', '[]'::jsonb), case when coalesce((payload #>> '{profile,onboarding_completed}')::boolean, false) then now() else null end)
  on conflict (id) do update set username = excluded.username, bio = excluded.bio, gender = excluded.gender, onboarding_goal = excluded.onboarding_goal, payday = excluded.payday, onboarding_balance = excluded.onboarding_balance, onboarding_accounts = excluded.onboarding_accounts, onboarding_completed_at = case when excluded.onboarding_completed_at is null then null else coalesce(profiles.onboarding_completed_at, excluded.onboarding_completed_at) end;
  insert into public.user_settings (user_id, theme, notes_reminders, reminder_time, savings_reminders, revision)
  values (owner, coalesce(payload #>> '{settings,theme}', 'system'), coalesce((payload #>> '{settings,notes_reminders}')::boolean, false), coalesce((payload #>> '{settings,reminder_time}')::time, '20:00'), coalesce((payload #>> '{settings,savings_reminders}')::boolean, true), coalesce((payload #>> '{settings,revision}')::bigint, 0))
  on conflict (user_id) do update set theme = excluded.theme, notes_reminders = excluded.notes_reminders, reminder_time = excluded.reminder_time, savings_reminders = excluded.savings_reminders, revision = excluded.revision;
  delete from public.wallets w
  where w.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'wallets', '[]'::jsonb)) item
      where item->>'code' = w.code
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'wallets', '[]'::jsonb)) loop
    insert into public.wallets (user_id, code, opening_balance, active) values (owner, item->>'code', coalesce((item->>'opening_balance')::bigint, 0), coalesce((item->>'active')::boolean, true)) on conflict (user_id, code) do update set opening_balance = excluded.opening_balance, active = excluded.active;
  end loop;
  delete from public.savings_movements m
  where m.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'movements', '[]'::jsonb)) item
      where (item->>'id')::uuid = m.id
    );
  delete from public.savings_goals g
  where g.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'goals', '[]'::jsonb)) item
      where (item->>'id')::uuid = g.id
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb)) loop
    insert into public.categories (user_id, type, code, label, icon, archived, is_system) values (owner, item->>'type', item->>'code', item->>'label', item->>'icon', coalesce((item->>'archived')::boolean, false), coalesce((item->>'is_system')::boolean, false)) on conflict (user_id, type, code) do update set label = excluded.label, icon = excluded.icon, archived = excluded.archived, is_system = excluded.is_system;
  end loop;
  delete from public.categories c
  where c.user_id = owner
    and c.is_system = false
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb)) item
      where item->>'type' = c.type and item->>'code' = c.code
    );
  delete from public.transactions t
  where t.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'transactions', '[]'::jsonb)) item
      where (item->>'id')::uuid = t.id
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'transactions', '[]'::jsonb)) loop
    insert into public.transactions (id, user_id, type, amount, category_type, category_code, account_code, occurred_on, description, receipt_name, receipt_path, revision, created_at) values ((item->>'id')::uuid, owner, item->>'type', (item->>'amount')::bigint, item->>'category_type', item->>'category_code', item->>'account_code', (item->>'occurred_on')::date, coalesce(item->>'description', ''), nullif(item->>'receipt_name', ''), nullif(item->>'receipt_path', ''), greatest(coalesce((item->>'revision')::bigint, 1), 1), coalesce((item->>'created_at')::timestamptz, now())) on conflict (id) do update set type = excluded.type, amount = excluded.amount, category_type = excluded.category_type, category_code = excluded.category_code, account_code = excluded.account_code, occurred_on = excluded.occurred_on, description = excluded.description, receipt_name = excluded.receipt_name, receipt_path = excluded.receipt_path, revision = excluded.revision, created_at = excluded.created_at where public.transactions.user_id = owner;
  end loop;
  delete from public.budgets b
  where b.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'budgets', '[]'::jsonb)) item
      where (item->>'month_start')::date = b.month_start and item->>'category_code' = b.category_code
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'budgets', '[]'::jsonb)) loop
    insert into public.budgets (user_id, month_start, category_code, limit_amount, default_account) values (owner, (item->>'month_start')::date, item->>'category_code', (item->>'limit_amount')::bigint, nullif(item->>'default_account', '')) on conflict (user_id, month_start, category_code) do update set limit_amount = excluded.limit_amount, default_account = excluded.default_account;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'goals', '[]'::jsonb)) loop
    insert into public.savings_goals (id, user_id, name, target, icon, deadline, reminder_day, archived, deleted, revision, created_at) values ((item->>'id')::uuid, owner, item->>'name', (item->>'target')::bigint, item->>'icon', nullif(item->>'deadline', '')::date, coalesce((item->>'reminder_day')::integer, 0), coalesce((item->>'archived')::boolean, false), coalesce((item->>'deleted')::boolean, false), greatest(coalesce((item->>'revision')::bigint, 1), 1), coalesce((item->>'created_at')::timestamptz, now())) on conflict (id) do update set name = excluded.name, target = excluded.target, icon = excluded.icon, deadline = excluded.deadline, reminder_day = excluded.reminder_day, archived = excluded.archived, deleted = excluded.deleted, revision = excluded.revision, created_at = excluded.created_at where public.savings_goals.user_id = owner;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'movements', '[]'::jsonb)) loop
    insert into public.savings_movements (id, user_id, goal_id, direction, amount, account_code, movement_date, description, created_at) values ((item->>'id')::uuid, owner, (item->>'goal_id')::uuid, item->>'direction', (item->>'amount')::bigint, item->>'account_code', (item->>'movement_date')::date, coalesce(item->>'description', ''), coalesce((item->>'created_at')::timestamptz, now())) on conflict (id, user_id) do update set goal_id = excluded.goal_id, direction = excluded.direction, amount = excluded.amount, account_code = excluded.account_code, movement_date = excluded.movement_date, description = excluded.description, created_at = excluded.created_at;
  end loop;
  if coalesce((payload #>> '{_meta,require_empty}')::boolean, false) then
    if nullif(payload #>> '{_meta,migration,source_fingerprint}', '') is null then
      raise exception using errcode = '22023', message = 'Migration fingerprint is required';
    end if;
    insert into public.finance_migrations (user_id, version, source_fingerprint, status, counts, completed_at)
    values (owner, 1, payload #>> '{_meta,migration,source_fingerprint}', 'completed', payload #> '{_meta,migration,counts}', now());
  end if;
  return public.get_finance_snapshot();
end;
$$;

revoke all on function public.get_finance_snapshot() from public, anon;
grant execute on function public.get_finance_snapshot() to authenticated;
revoke all on function public.replace_finance_snapshot(jsonb) from public, anon;
grant execute on function public.replace_finance_snapshot(jsonb) to authenticated;

commit;

