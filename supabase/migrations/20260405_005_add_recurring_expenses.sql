begin;

create table public.recurring_expenses (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references public.users(id) on delete cascade,
  description          text        not null,
  category_id          uuid        not null references public.categories(id),
  category_name        text        not null,
  amount               integer     not null check (amount > 0),
  day_of_month         integer     not null default 1 check (day_of_month between 1 and 28),
  is_active            boolean     not null default true,
  last_reminded_month  text,                    -- 'YYYY-MM'; null = never reminded
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_recurring_expenses_user_id on public.recurring_expenses (user_id);
create index idx_recurring_expenses_active   on public.recurring_expenses (is_active) where is_active = true;

create trigger trg_recurring_expenses_set_updated_at
before update on public.recurring_expenses
for each row execute function public.set_updated_at();

commit;
