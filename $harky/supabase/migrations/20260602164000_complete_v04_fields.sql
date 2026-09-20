alter table public.accounts
  add column if not exists overdraft_policy text
  check (overdraft_policy in ('block', 'warn', 'allow'));

alter table public.categories
  add column if not exists weekly_budget numeric(16, 2) check (weekly_budget >= 0),
  add column if not exists annual_budget numeric(16, 2) check (annual_budget >= 0);

alter table public.transactions
  drop constraint if exists transactions_recurring_check;

alter table public.transactions
  add constraint transactions_recurring_check check (recurring in ('weekly', 'monthly')),
  add column if not exists recurring_start date,
  add column if not exists recurring_end date,
  add column if not exists recurring_next date;

alter table public.goal_contributions
  add column if not exists note text;
