begin;

-- =========================================================
-- VOICE USAGE QUOTA (per user, per day, in user's local timezone)
-- =========================================================
--
-- Tracks how many voice messages a user has transcribed in their local
-- calendar day. Used to apply a daily quota for trial users so a single
-- user cannot exhaust the OpenAI Whisper budget.
--
-- The counter is incremented BEFORE the Whisper call (defensive — failed
-- attempts also count, otherwise users could spam huge invalid uploads).
-- date_local is the user's local date — quota resets at the user's midnight,
-- not the server's, so timezones don't penalise users near UTC boundaries.

create table public.voice_usage_daily (
  user_id    uuid    not null references public.users(id) on delete cascade,
  date_local date    not null,
  count      integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, date_local)
);

create index idx_voice_usage_daily_date_local
  on public.voice_usage_daily (date_local);

create trigger trg_voice_usage_daily_set_updated_at
before update on public.voice_usage_daily
for each row
execute function public.set_updated_at();

commit;
