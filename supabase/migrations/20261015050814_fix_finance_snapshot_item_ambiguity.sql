-- Separate SQL array values from the PL/pgSQL loop variable item.
-- Replaces only the RPC definition; existing rows and owner checks are preserved.
begin;

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
      from jsonb_array_elements(coalesce(payload->'wallets', '[]'::jsonb)) as incoming(value)
      where incoming.value->>'code' = w.code
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'wallets', '[]'::jsonb)) loop
    insert into public.wallets (user_id, code, opening_balance, active) values (owner, item->>'code', coalesce((item->>'opening_balance')::bigint, 0), coalesce((item->>'active')::boolean, true)) on conflict (user_id, code) do update set opening_balance = excluded.opening_balance, active = excluded.active;
  end loop;
  delete from public.savings_movements m
  where m.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'movements', '[]'::jsonb)) as incoming(value)
      where (incoming.value->>'id')::uuid = m.id
    );
  delete from public.savings_goals g
  where g.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'goals', '[]'::jsonb)) as incoming(value)
      where (incoming.value->>'id')::uuid = g.id
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb)) loop
    insert into public.categories (user_id, type, code, label, icon, archived, is_system) values (owner, item->>'type', item->>'code', item->>'label', item->>'icon', coalesce((item->>'archived')::boolean, false), coalesce((item->>'is_system')::boolean, false)) on conflict (user_id, type, code) do update set label = excluded.label, icon = excluded.icon, archived = excluded.archived, is_system = excluded.is_system;
  end loop;
  delete from public.categories c
  where c.user_id = owner
    and c.is_system = false
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb)) as incoming(value)
      where incoming.value->>'type' = c.type and incoming.value->>'code' = c.code
    );
  delete from public.transactions t
  where t.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'transactions', '[]'::jsonb)) as incoming(value)
      where (incoming.value->>'id')::uuid = t.id
    );
  for item in select * from jsonb_array_elements(coalesce(payload->'transactions', '[]'::jsonb)) loop
    insert into public.transactions (id, user_id, type, amount, category_type, category_code, account_code, occurred_on, description, receipt_name, receipt_path, revision, created_at) values ((item->>'id')::uuid, owner, item->>'type', (item->>'amount')::bigint, item->>'category_type', item->>'category_code', item->>'account_code', (item->>'occurred_on')::date, coalesce(item->>'description', ''), nullif(item->>'receipt_name', ''), nullif(item->>'receipt_path', ''), greatest(coalesce((item->>'revision')::bigint, 1), 1), coalesce((item->>'created_at')::timestamptz, now())) on conflict (id) do update set type = excluded.type, amount = excluded.amount, category_type = excluded.category_type, category_code = excluded.category_code, account_code = excluded.account_code, occurred_on = excluded.occurred_on, description = excluded.description, receipt_name = excluded.receipt_name, receipt_path = excluded.receipt_path, revision = excluded.revision, created_at = excluded.created_at where public.transactions.user_id = owner;
  end loop;
  delete from public.budgets b
  where b.user_id = owner
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'budgets', '[]'::jsonb)) as incoming(value)
      where (incoming.value->>'month_start')::date = b.month_start and incoming.value->>'category_code' = b.category_code
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

notify pgrst, 'reload schema';
commit;
