begin;
create table public.bill_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  amount bigint not null check (amount between 1 and 999999999999),
  estimated boolean not null default false,
  due_on date not null check (due_on between '1900-01-01' and '9998-12-31'),
  recurrence text not null check (recurrence in ('once', 'monthly')),
  anchor_day integer not null check (anchor_day between 1 and 31),
  category_code text not null check (char_length(category_code) between 1 and 80),
  account_code text not null check (account_code in ('cash', 'bank', 'ewallet')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  unique (user_id, series_id, due_on),
  check ((status = 'paid') = (paid_at is not null))
);
create index bill_reminders_owner_due_idx on public.bill_reminders(user_id, status, due_on);
alter table public.bill_reminders enable row level security;
revoke all on public.bill_reminders from public, anon;
grant select, insert, update, delete on public.bill_reminders to authenticated;
create policy bills_select on public.bill_reminders for select to authenticated using (user_id = (select auth.uid()));
create policy bills_insert on public.bill_reminders for insert to authenticated with check (user_id = (select auth.uid()));
create policy bills_update on public.bill_reminders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy bills_delete on public.bill_reminders for delete to authenticated using (user_id = (select auth.uid()));

-- A reminder status change never writes to wallets, transactions or budgets.
create function public.complete_bill_reminder(bill_id uuid, expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_bill public.bill_reminders%rowtype;
  next_month date;
  next_due date;
begin
  if (select auth.uid()) is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  select b.* into current_bill from public.bill_reminders b
    where b.id = bill_id and b.user_id = (select auth.uid()) for update;
  if not found or current_bill.revision <> expected_revision or current_bill.status <> 'pending' then
    raise exception using errcode = '40001', message = 'Bill changed; reload before updating';
  end if;
  if current_bill.recurrence = 'monthly' then
    next_month := (date_trunc('month', current_bill.due_on) + interval '1 month')::date;
    next_due := next_month + (least(current_bill.anchor_day, extract(day from (next_month + interval '1 month - 1 day'))::integer) - 1);
    insert into public.bill_reminders (user_id, series_id, name, amount, estimated, due_on, recurrence, anchor_day, category_code, account_code)
    values (current_bill.user_id, current_bill.series_id, current_bill.name, current_bill.amount, current_bill.estimated, next_due, current_bill.recurrence, current_bill.anchor_day, current_bill.category_code, current_bill.account_code);
  end if;
  update public.bill_reminders b set status = 'paid', paid_at = now(), revision = b.revision + 1
    where b.id = current_bill.id and b.user_id = (select auth.uid());
  return jsonb_build_object('id', current_bill.id, 'next_due', next_due);
end;
$$;
revoke all on function public.complete_bill_reminder(uuid, integer) from public, anon;
grant execute on function public.complete_bill_reminder(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
