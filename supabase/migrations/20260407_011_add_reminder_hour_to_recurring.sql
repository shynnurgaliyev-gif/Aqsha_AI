begin;

alter table public.recurring_expenses
  add column reminder_hour smallint not null default 9
    check (reminder_hour between 0 and 23);

commit;
