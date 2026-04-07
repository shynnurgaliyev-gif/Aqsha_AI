begin;

-- =========================================================
-- EXPANDED SYSTEM CATEGORIES
-- Adds new expense and income categories to complement
-- the existing set. Safe to run multiple times (ON CONFLICT DO NOTHING).
-- =========================================================

with seed(kind, name, icon, sort_order) as (
  values
    -- Expense: new categories
    ('expense', 'Кафе',        '🍴', 45),   -- cafes, restaurants (separate from Еда/groceries)
    ('expense', 'Бензин',      '⛽', 42),   -- fuel, petrol
    ('expense', 'Аренда',      '🏠', 75),   -- rent (separate from Коммуналка/utilities)
    ('expense', 'Спорт',       '🏋️', 115),  -- gym, fitness, sports
    ('expense', 'Красота',     '💅', 120),  -- salon, cosmetics, barber
    ('expense', 'Путешествия', '✈️', 125),  -- travel, hotels, flights
    ('expense', 'Ремонт',      '🔧', 130),  -- home repair, tools, materials
    ('expense', 'Питомец',     '🐾', 135),  -- pet food, vet, grooming

    -- Income: new categories
    ('income', 'Проценты',    '📈', 45),   -- bank interest, deposits
    ('income', 'Аренда',      '🏠', 55),   -- rental income
    ('income', 'Бизнес',      '💼', 60)    -- business income
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
