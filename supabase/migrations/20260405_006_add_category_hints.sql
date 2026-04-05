begin;

-- Caches AI category resolutions per user.
-- Key: (user_id, candidate, kind) — candidate is the normalized category name
-- extracted by the deterministic parser or AI (e.g. "коммуналка", "такси").
-- After the first AI call, subsequent identical candidates are resolved from cache.
create table public.category_hints (
  user_id       uuid  not null references public.users(id) on delete cascade,
  candidate     text  not null,  -- lower(trim(categoryCandidate))
  kind          text  not null check (kind in ('expense', 'income')),
  category_id   uuid  not null references public.categories(id),
  category_name text  not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, candidate, kind)
);

commit;
