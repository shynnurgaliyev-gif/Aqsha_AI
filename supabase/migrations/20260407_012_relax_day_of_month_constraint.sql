begin;

-- Expand day_of_month to allow 1–31.
-- The scheduler uses LEAST(day_of_month, last_day_of_month) so days like 29–31
-- gracefully fall back to the last valid day of shorter months.
alter table public.recurring_expenses
  drop constraint recurring_expenses_day_of_month_check;

alter table public.recurring_expenses
  add constraint recurring_expenses_day_of_month_check
    check (day_of_month between 1 and 31);

commit;
