begin;

create extension if not exists pgcrypto;

-- =========================================================
-- COMMON TRIGGERS / FUNCTIONS
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Проверка транзакции:
-- 1) категория существует
-- 2) kind транзакции совпадает с kind категории
-- 3) пользователь не может писать в чужую пользовательскую категорию
-- 4) если transaction_date_local не передан, он считается по timezone пользователя
-- 5) мягкое удаление синхронизирует deleted_at / parse_status
create or replace function public.validate_transaction_category_and_fill_date()
returns trigger
language plpgsql
as $$
declare
  v_cat_kind text;
  v_cat_user_id uuid;
  v_cat_is_system boolean;
  v_user_tz text;
begin
  select c.kind, c.user_id, c.is_system
    into v_cat_kind, v_cat_user_id, v_cat_is_system
  from public.categories c
  where c.id = new.category_id;

  if not found then
    raise exception 'Category % not found', new.category_id;
  end if;

  if v_cat_kind <> new.kind then
    raise exception 'Transaction kind (%) does not match category kind (%)', new.kind, v_cat_kind;
  end if;

  if v_cat_is_system = false and v_cat_user_id <> new.user_id then
    raise exception 'Category does not belong to this user';
  end if;

  if new.transaction_at is null then
    new.transaction_at = now();
  end if;

  if new.transaction_date_local is null then
    select u.timezone
      into v_user_tz
    from public.users u
    where u.id = new.user_id;

    if v_user_tz is null then
      v_user_tz := 'Asia/Almaty';
    end if;

    new.transaction_date_local := (new.transaction_at at time zone v_user_tz)::date;
  end if;

  if new.is_deleted = true and new.deleted_at is null then
    new.deleted_at := now();
  end if;

  if new.is_deleted = false then
    new.deleted_at := null;
    if new.parse_status = 'deleted' then
      new.parse_status := 'corrected';
    end if;
  end if;

  if new.is_deleted = true and new.parse_status <> 'deleted' then
    new.parse_status := 'deleted';
  end if;

  return new;
end;
$$;

-- Синхронизация текущего статуса пользователя из текущей подписки
create or replace function public.sync_user_plan_status_from_subscription()
returns trigger
language plpgsql
as $$
begin
  if new.is_current = true then
    update public.users
       set current_plan_status = new.status,
           updated_at = now()
     where id = new.user_id;
  end if;

  return new;
end;
$$;

-- =========================================================
-- USERS
-- =========================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),

  telegram_user_id bigint not null unique,
  telegram_username text null,
  first_name text null,
  last_name text null,

  language_code text not null default 'ru',
  timezone text not null default 'Asia/Almaty',

  is_active boolean not null default true,
  onboarding_completed boolean not null default false,

  current_plan_status text not null default 'trial'
    check (current_plan_status in (
      'trial',
      'active',
      'expired',
      'blocked',
      'grace',
      'canceled',
      'pending'
    )),

  daily_recommendations_enabled boolean not null default true,
  daily_recommendations_hour smallint not null default 9
    check (daily_recommendations_hour between 0 and 23),

  registered_at timestamptz not null default now(),
  last_seen_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_current_plan_status
  on public.users (current_plan_status);

create index idx_users_last_seen_at
  on public.users (last_seen_at);

create trigger trg_users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

-- =========================================================
-- CATEGORIES
-- =========================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),

  user_id uuid null references public.users(id) on delete cascade,

  kind text not null
    check (kind in ('expense', 'income')),

  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,

  icon text null,
  color text null,

  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_categories_scope
    check (
      (is_system = true and user_id is null)
      or
      (is_system = false and user_id is not null)
    )
);

create index idx_categories_user_id
  on public.categories (user_id);

create index idx_categories_kind
  on public.categories (kind);

create unique index uq_categories_system_kind_normalized
  on public.categories (kind, normalized_name)
  where is_system = true;

create unique index uq_categories_user_kind_normalized
  on public.categories (user_id, kind, normalized_name)
  where is_system = false;

create trigger trg_categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

-- =========================================================
-- SUBSCRIPTIONS
-- =========================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,

  plan_code text not null default 'monthly_kzt_800',

  status text not null
    check (status in (
      'trial',
      'active',
      'expired',
      'canceled',
      'grace',
      'pending'
    )),

  is_current boolean not null default true,

  trial_start_at timestamptz null,
  trial_end_at timestamptz null,

  paid_from timestamptz null,
  paid_until timestamptz null,

  payment_provider text null default 'stub',
  payment_reference text null,
  auto_renew boolean not null default false,

  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_subscriptions_trial_range
    check (
      trial_start_at is null
      or trial_end_at is null
      or trial_end_at > trial_start_at
    ),

  constraint chk_subscriptions_paid_range
    check (
      paid_from is null
      or paid_until is null
      or paid_until > paid_from
    )
);

create unique index uq_subscriptions_current_per_user
  on public.subscriptions (user_id)
  where is_current = true;

create index idx_subscriptions_status
  on public.subscriptions (status);

create index idx_subscriptions_paid_until
  on public.subscriptions (paid_until);

create trigger trg_subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

create trigger trg_subscriptions_sync_user_plan
after insert or update on public.subscriptions
for each row
execute function public.sync_user_plan_status_from_subscription();

-- =========================================================
-- USER SESSIONS
-- =========================================================

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null unique references public.users(id) on delete cascade,

  session_status text not null default 'idle'
    check (session_status in (
      'idle',
      'awaiting_input',
      'awaiting_confirmation',
      'in_flow',
      'expired'
    )),

  current_flow text null,
  current_step text null,

  context_json jsonb not null default '{}'::jsonb,

  last_user_message_at timestamptz null,
  last_bot_message_at timestamptz null,

  expires_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_sessions_status
  on public.user_sessions (session_status);

create index idx_user_sessions_expires_at
  on public.user_sessions (expires_at);

create trigger trg_user_sessions_set_updated_at
before update on public.user_sessions
for each row
execute function public.set_updated_at();

-- =========================================================
-- TRANSACTIONS
-- =========================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,

  kind text not null
    check (kind in ('expense', 'income')),

  amount integer not null
    check (amount > 0),

  currency_code text not null default 'KZT',

  transaction_date_local date not null,
  transaction_at timestamptz not null default now(),

  note text null,

  source_type text not null
    check (source_type in (
      'text',
      'voice',
      'manual_edit',
      'admin'
    )),

  source_raw_text text null,
  voice_file_id text null,

  parse_status text not null default 'confirmed'
    check (parse_status in (
      'draft',
      'confirmed',
      'corrected',
      'deleted'
    )),

  is_deleted boolean not null default false,
  deleted_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transactions_user_id
  on public.transactions (user_id);

create index idx_transactions_user_date_active
  on public.transactions (user_id, transaction_date_local desc)
  where is_deleted = false;

create index idx_transactions_user_category_date_active
  on public.transactions (user_id, category_id, transaction_date_local desc)
  where is_deleted = false;

create index idx_transactions_user_kind_date_active
  on public.transactions (user_id, kind, transaction_date_local desc)
  where is_deleted = false;

create index idx_transactions_parse_status
  on public.transactions (parse_status);

create index idx_transactions_created_at
  on public.transactions (created_at desc);

create trigger trg_transactions_set_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();

create trigger trg_transactions_validate_category
before insert or update on public.transactions
for each row
execute function public.validate_transaction_category_and_fill_date();

-- =========================================================
-- DAILY RECOMMENDATIONS
-- =========================================================

create table public.daily_recommendations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,

  recommendation_date_local date not null,
  scheduled_for timestamptz null,
  generated_at timestamptz not null default now(),

  message_text text not null,
  payload_json jsonb not null default '{}'::jsonb,

  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),

  delivered_at timestamptz null,
  error_text text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_daily_recommendations_user_date
  on public.daily_recommendations (user_id, recommendation_date_local);

create index idx_daily_recommendations_status
  on public.daily_recommendations (delivery_status);

create index idx_daily_recommendations_scheduled_for
  on public.daily_recommendations (scheduled_for);

create trigger trg_daily_recommendations_set_updated_at
before update on public.daily_recommendations
for each row
execute function public.set_updated_at();

-- =========================================================
-- ADMIN EVENTS
-- =========================================================

create table public.admin_events (
  id bigint generated always as identity primary key,

  user_id uuid null references public.users(id) on delete set null,

  event_type text not null,
  event_source text not null
    check (event_source in ('bot', 'worker', 'cron', 'admin', 'system', 'ai')),

  severity text not null default 'info'
    check (severity in ('debug', 'info', 'warn', 'error')),

  event_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index idx_admin_events_created_at
  on public.admin_events (created_at desc);

create index idx_admin_events_event_type
  on public.admin_events (event_type);

create index idx_admin_events_user_id
  on public.admin_events (user_id);

-- =========================================================
-- TELEGRAM UPDATE DEDUP / AUDIT
-- =========================================================

create table public.telegram_update_receipts (
  update_id bigint primary key,

  telegram_user_id bigint null,
  chat_id bigint null,
  update_type text null,

  payload_json jsonb not null default '{}'::jsonb,

  received_at timestamptz not null default now(),
  processed_at timestamptz null,

  status text not null default 'received'
    check (status in ('received', 'processed', 'failed', 'ignored')),

  error_text text null
);

create index idx_telegram_update_receipts_status
  on public.telegram_update_receipts (status);

create index idx_telegram_update_receipts_received_at
  on public.telegram_update_receipts (received_at desc);

-- =========================================================
-- JOB QUEUE (POSTGRES-BASED)
-- =========================================================

create table public.job_queue (
  id bigint generated always as identity primary key,

  job_type text not null,
  user_id uuid null references public.users(id) on delete cascade,

  payload_json jsonb not null default '{}'::jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'canceled')),

  run_after timestamptz not null default now(),

  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),

  locked_at timestamptz null,
  locked_by text null,

  last_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_job_queue_status_run_after
  on public.job_queue (status, run_after);

create index idx_job_queue_user_id
  on public.job_queue (user_id);

create index idx_job_queue_job_type
  on public.job_queue (job_type);

create trigger trg_job_queue_set_updated_at
before update on public.job_queue
for each row
execute function public.set_updated_at();

-- =========================================================
-- SYSTEM CATEGORY SEED
-- =========================================================

with seed(kind, name, icon, sort_order) as (
  values
    ('expense', 'Еда', '🍽️', 10),
    ('expense', 'Продукты', '🛒', 20),
    ('expense', 'Такси', '🚕', 30),
    ('expense', 'Транспорт', '🚌', 40),
    ('expense', 'Кофе', '☕', 50),
    ('expense', 'Развлечения', '🎉', 60),
    ('expense', 'Здоровье', '💊', 70),
    ('expense', 'Коммуналка', '🏠', 80),
    ('expense', 'Одежда', '👕', 90),
    ('expense', 'Образование', '📚', 100),
    ('expense', 'Связь', '📱', 110),
    ('expense', 'Прочее', '📦', 999),

    ('income', 'Зарплата', '💼', 10),
    ('income', 'Подарок', '🎁', 20),
    ('income', 'Подработка', '🧰', 30),
    ('income', 'Возврат', '↩️', 40),
    ('income', 'Продажа', '💸', 50),
    ('income', 'Прочее', '📦', 999)
)
insert into public.categories (
  user_id,
  kind,
  name,
  icon,
  color,
  is_system,
  is_active,
  sort_order
)
select
  null,
  s.kind,
  s.name,
  s.icon,
  null,
  true,
  true,
  s.sort_order
from seed s
where not exists (
  select 1
  from public.categories c
  where c.is_system = true
    and c.kind = s.kind
    and c.normalized_name = lower(btrim(s.name))
);

commit;