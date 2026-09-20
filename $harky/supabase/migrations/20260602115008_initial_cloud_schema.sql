create extension if not exists "pgcrypto";

create or replace function public.set_updated_at_and_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  currency text not null default 'DOP' check (currency in ('DOP', 'USD', 'EUR')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text,
  name text not null,
  short_name text not null,
  account_type text not null check (account_type in ('debit', 'savings', 'credit', 'cash')),
  color text not null,
  balance numeric(16, 2) not null default 0,
  last_four text,
  credit_limit numeric(16, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, local_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text,
  name text not null,
  category_type text not null check (category_type in ('expense', 'income')),
  color text not null,
  budget numeric(16, 2) not null default 0 check (budget >= 0),
  icon text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, local_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text,
  transaction_type text not null check (transaction_type in ('income', 'expense', 'transfer')),
  amount numeric(16, 2) not null check (amount > 0),
  transaction_date date not null,
  note text not null default '',
  category_id uuid references public.categories(id),
  account_id uuid references public.accounts(id),
  from_account_id uuid references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  recurring text check (recurring in ('monthly')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, local_id),
  check (
    (transaction_type in ('income', 'expense') and account_id is not null)
    or
    (transaction_type = 'transfer' and from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id)
  )
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text,
  name text not null,
  target numeric(16, 2) not null check (target > 0),
  saved numeric(16, 2) not null default 0 check (saved >= 0),
  color text not null,
  icon text not null,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, local_id)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text,
  goal_id uuid not null references public.goals(id),
  from_account_id uuid references public.accounts(id),
  amount numeric(16, 2) not null check (amount > 0),
  contributed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, local_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, local_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  platform text not null,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1
);

create index accounts_user_updated_idx on public.accounts (user_id, updated_at);
create index categories_user_updated_idx on public.categories (user_id, updated_at);
create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index goals_user_updated_idx on public.goals (user_id, updated_at);
create index goal_contributions_user_updated_idx on public.goal_contributions (user_id, updated_at);
create index audit_events_user_created_idx on public.audit_events (user_id, created_at desc);
create index devices_user_updated_idx on public.devices (user_id, updated_at);

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at_and_revision();
create trigger accounts_updated_at before update on public.accounts
for each row execute function public.set_updated_at_and_revision();
create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at_and_revision();
create trigger transactions_updated_at before update on public.transactions
for each row execute function public.set_updated_at_and_revision();
create trigger goals_updated_at before update on public.goals
for each row execute function public.set_updated_at_and_revision();
create trigger goal_contributions_updated_at before update on public.goal_contributions
for each row execute function public.set_updated_at_and_revision();
create trigger audit_events_updated_at before update on public.audit_events
for each row execute function public.set_updated_at_and_revision();
create trigger devices_updated_at before update on public.devices
for each row execute function public.set_updated_at_and_revision();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, user_id, display_name)
  values (new.id, new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'accounts',
    'categories',
    'transactions',
    'goals',
    'goal_contributions',
    'audit_events',
    'devices'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "users_select_own_%1$s" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name
    );
    execute format(
      'create policy "users_insert_own_%1$s" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name
    );
    execute format(
      'create policy "users_update_own_%1$s" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
    execute format(
      'create policy "users_delete_own_%1$s" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end;
$$;
