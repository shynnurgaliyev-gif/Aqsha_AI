begin;

-- =========================================================
-- MONTHLY BUDGETS
-- =========================================================

-- Trigger function: ensures budget category is always expense kind.
-- Called on INSERT and UPDATE of monthly_budgets.
create or replace function public.validate_monthly_budget_category()
returns trigger
language plpgsql
as $$
declare
  v_cat_kind text;
begin
  select kind into v_cat_kind
    from public.categories
   where id = new.category_id;

  if not found then
    raise exception 'Category % not found', new.category_id;
  end if;

  if v_cat_kind <> 'expense' then
    raise exception 'Monthly budget category must be expense kind, got %', v_cat_kind;
  end if;

  return new;
end;
$$;

create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),

  user_id     uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,

  -- Deterministic month key in YYYY-MM format.
  -- One row per user/category/month — enforced by unique constraint below.
  year_month  text not null
    check (year_month ~ '^\d{4}-\d{2}$'),

  amount      integer not null
    check (amount > 0),

  currency_code text not null default 'KZT',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint uq_monthly_budgets_user_category_month
    unique (user_id, category_id, year_month)
);

create index idx_monthly_budgets_user_id
  on public.monthly_budgets (user_id);

create index idx_monthly_budgets_user_month
  on public.monthly_budgets (user_id, year_month);

create trigger trg_monthly_budgets_set_updated_at
before update on public.monthly_budgets
for each row
execute function public.set_updated_at();

create trigger trg_monthly_budgets_validate_category
before insert or update on public.monthly_budgets
for each row
execute function public.validate_monthly_budget_category();

commit;
