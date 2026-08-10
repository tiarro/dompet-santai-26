create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  title text not null check (char_length(title) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
