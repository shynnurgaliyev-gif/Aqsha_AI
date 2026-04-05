begin;

create table public.weekly_reports (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.users(id) on delete cascade,
  week_start_date  date        not null,
  message_text     text        not null,
  payload_json     jsonb       not null default '{}',
  delivery_status  text        not null default 'pending'
                               check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  error_text       text,
  generated_at     timestamptz not null default now(),
  delivered_at     timestamptz,
  constraint uq_weekly_reports_user_week unique (user_id, week_start_date)
);

create index idx_weekly_reports_user_id on public.weekly_reports (user_id);

commit;
