begin;

create table public.savings_goals (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.users(id) on delete cascade,
  name            text        not null,
  normalized_name text        not null,
  target_amount   integer     not null check (target_amount > 0),
  saved_amount    integer     not null default 0 check (saved_amount >= 0),
  is_completed    boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_savings_goals_user_name unique (user_id, normalized_name)
);

create index idx_savings_goals_user_id on public.savings_goals (user_id);

create trigger trg_savings_goals_set_updated_at
before update on public.savings_goals
for each row execute function public.set_updated_at();

commit;
