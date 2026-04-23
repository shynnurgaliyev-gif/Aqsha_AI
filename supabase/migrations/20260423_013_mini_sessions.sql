begin;

create table public.mini_sessions (
  id         uuid        not null default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  token_hash text        not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint mini_sessions_pkey primary key (id)
);

create index idx_mini_sessions_token_hash on public.mini_sessions (token_hash);
create index idx_mini_sessions_user_id    on public.mini_sessions (user_id);

-- Auto-clean expired sessions older than 7 days (belt-and-suspenders; tokens are checked in app code too)
comment on table public.mini_sessions is
  'Short-lived Telegram Mini App auth tokens. Expired rows are safe to delete.';

commit;
