# CLAUDE.md

## Project
Aqsha_AI — AI-powered Telegram personal finance assistant.
TypeScript · pnpm monorepo · Fastify v5 · Supabase Postgres · Render (Docker).

---

## Mode
Free collaboration. Architectural analysis, improvements, and refactoring are allowed
and encouraged — propose them proactively. Flag bottlenecks and risks without waiting
to be asked. Prefer correctness and simplicity; avoid over-engineering.

---

## Agent Model

Two coordinated agents operate on this project:

| Agent | Role |
|-------|------|
| **dev-agent** | Plans, implements, refactors, improves architecture |
| **qa-agent** | Validates output: typecheck, build, logic review, domain rule audit |

**Coordination rule:** dev-agent spawns qa-agent when implementation is complete.
QA returns a structured PASS / FAIL report. Dev addresses failures, re-spawns QA.
Task is done only when QA returns PASS.

---

## Stack (change only with explicit decision)

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22, TypeScript |
| Monorepo | pnpm workspaces |
| Bot API | Fastify v5 |
| Admin web | Next.js 15 |
| Database | Supabase Postgres via postgres.js (no ORM) |
| Infra | Render.com, Docker containers |
| AI | OpenAI API (gpt-4.1-mini / gpt-4o-mini-transcribe) |

---

## Repository Structure

```
apps/bot-api/       — Telegram webhook / HTTP service
apps/worker/        — Background job processor
apps/admin-web/     — Internal admin dashboard + Mini App UI
packages/config/    — Env schema + validation (@aqsha-ai/config)
packages/shared/    — Domain enums and types (@aqsha-ai/shared)
packages/database/  — DB connection layer (@aqsha-ai/database)
supabase/migrations/ — Schema source of truth (SQL only)
docs/               — Project memory
```

---

## Domain Rules (non-negotiable)

- **Money is stored as integer.** No float arithmetic anywhere in the stack.
- **Financial truth lives in DB + deterministic SQL.** LLM is for parsing and formatting only — never for computing balances/totals.
- **DB schema changes via SQL migrations only.** Never via ORM, Supabase dashboard, or ad-hoc SQL outside migration files.
- **No Supabase Auth for Telegram end users.** Users keyed by `telegram_user_id`.
- **No self-hosted LLM on Render.** All LLM calls use OpenAI API.
- **Voice actions with ambiguous intent must trigger confirmation** before any DB write.
- **`telegram_update_receipts` is written before processing any Telegram update** (idempotency guard).
- **Multi-step flows must use `user_sessions` table.**

---

## Security Rules

- No secrets in the repository. `.env.example` contains variable names only.
- No hardcoded API keys, bot tokens, or DB passwords anywhere in code.
- Environment variables are the only secret delivery mechanism (via Render dashboard).

---

## Project Memory

| File | Purpose |
|------|---------|
| `docs/PROJECT_STATE.md` | Current phase, completed work, next steps |
| `docs/ARCHITECTURE_DECISIONS.md` | ADR-style architectural decisions |
| `docs/IMPLEMENTATION_LOG.md` | Factual log of accepted completed work |
| `docs/DEPLOY_RUNBOOK.md` | Deployment procedure for Render |
| `docs/CLOSED_SMOKE_TEST.md` | Smoke test checklist |

Read `PROJECT_STATE.md` before starting non-trivial work.
Update `PROJECT_STATE.md` and `IMPLEMENTATION_LOG.md` after every accepted task.

---

## Правила

### Экономия токенов
1. Не читать файлы целиком, если можно фрагмент (Grep / offset/limit / поиск по символам).
2. Не пересказывать пользователю код, который он и так видит. Кратко.
3. В ответах — diff/изменения, а не полные файлы.
4. Если задача неясна — 1–2 уточняющих вопроса вместо чтения пол-проекта.
5. Перед чтением нескольких файлов — спросить, нужно ли это.

### Ведение дневника
6. Если правишь файл и замечаешь по пути проблему/код-смелл/баг в другом месте — НЕ исправлять, а записать в `## Узкие места / TODO` с `файл:строка` + приоритет (🔴/🟡/🟢). В ответ короткой строкой: "⚠️ Заметил: [что], записал в TODO".
7. После каждой правки — одна строка: `файл:строка — суть`.
8. По команде "обнови дневник" или в конце сессии — обновить `## Где остановились` и `## Узкие места`.

### Ответы
9. По умолчанию кратко. Длинные объяснения — только по запросу "объясни подробно".
10. Без извинений и пересказа задачи. Сразу к делу.

---

## Обзор проекта

### Стек
- **Язык/runtime:** TypeScript, Node.js 22, ESM.
- **Бэкенд:** Fastify v5 (`apps/bot-api`).
- **Воркер:** опрос БД интервалом `JOB_POLL_INTERVAL_MS`, `FOR UPDATE SKIP LOCKED` (`apps/worker`).
- **Админ + Mini App UI:** Next.js 15 + React 19 (`apps/admin-web`); один деплой обслуживает и `/admin` (Basic Auth), и `/mini` (Telegram WebApp).
- **БД:** Supabase Postgres, доступ через `postgres.js` (`prepare:false` под PgBouncer transaction-mode).
- **STT:** OpenAI Whisper (`/v1/audio/transcriptions`) после ffmpeg → 16kHz mono mp3 через stdin/stdout pipe.
- **LLM:** OpenAI Chat Completions (`gpt-4.1-mini` по `.env.example`, `gpt-4o` дефолт в `env.ts` ⚠ дрейф).
- **Платежи:** ApiPay.kz (Kaspi QR) + TipTopPay + stub-режим.
- **Validation:** zod (только на env).
- **Логи:** pino (worker) / Fastify default logger (bot-api).

### Структура (3 уровня)
```
apps/
  bot-api/src/
    main.ts, app.ts, billing-webhook-route.ts
    billing/                  (factory + KaspiQR + TipTopPay)
    telegram/
      webhook-route.ts, update-handler.ts, update-router.ts
      receipt-repository.ts, telegram-client.ts, types.ts
      access-control.ts, user-bootstrap-service.ts, users-repository.ts
      session-repository.ts, subscription-repository.ts
      analytics/              (matcher + ai-query-parser + repository + handler + period-resolver)
      text-intake/            (parser + bulk-parser + ai-parser + category-resolver/-hints + handler + session-draft)
      voice-intake/           (file-fetcher + audio-converter + transcriber + handler)
      transaction-correction/ (matchers + sessions + repo + handler + formatter)
      budgets/, goals/, recurring/, export/, reset/, chat/, help/, billing/
      mini-app/               (mini-route + mini-auth + mini-session)
  worker/src/
    main.ts, app.ts
    job-queue/                (types, repository, processor, registry, handlers/)
    daily-recommendations/    (calculator, repository, scheduler, handlers/)
    weekly-reports/, recurring-reminders/
    subscriptions/lifecycle.ts
    billing/                  (grace + grace-final + trial-expiry + trial-2day schedulers/handlers)
    telegram/sender.ts        (throwing variant)
  admin-web/src/
    middleware.ts             (Basic Auth, исключает /api/health и /mini)
    app/(admin)/              (overview + admin_events)
    app/mini/                 (MiniShell + Dashboard/Transactions/Analytics/Profile)
    lib/db.ts, lib/queries.ts, lib/telegram.ts
packages/
  config/src/env.ts           (zod schema + parseEnv)
  database/src/pool.ts        (createDbPool, prepare:false)
  shared/src/enums.ts
supabase/migrations/          (13 миграций; см. ниже)
```

### Точки входа
- **bot-api:** `POST /telegram/webhook`, `POST /webhooks/billing`, `POST /telegram/mini/auth`, `GET /telegram/mini/{data,transactions,analytics}`, `GET /health`, `GET /`.
- **worker:** `setInterval(tick, JOB_POLL_INTERVAL_MS)`, единственный реентрант-гард (`tickInProgress`). Каждый тик: `subscriptions.lifecycle` → `daily-rec.scheduler` → `weekly-reports.scheduler` → 4 billing schedulers → `recurring-reminders.scheduler` → `processJobs`.
- **admin-web:** Next.js `app/`, middleware Basic Auth, `/api/health` открытый, `/mini` открытый (за ним свой Telegram-initData auth).

### Внешние зависимости
- Telegram Bot API (webhook + sendMessage/sendDocument/answerCallbackQuery + getFile + setWebhook).
- OpenAI API: `chat/completions` (text intake fallback, analytics intent, chat fallback) и `audio/transcriptions` (Whisper).
- ApiPay.kz / TipTopPay (Kaspi QR + карты).
- Supabase Postgres (через DATABASE_URL — pooler — для приложения, DATABASE_DIRECT_URL — для миграций).
- Render.com (контейнеры bot-api и worker; admin-web Dockerfile ещё не сделан).
- ffmpeg (системный; в Dockerfile bot-api).

### Схема данных (упрощённо)
- `users` — PK `id uuid`, `telegram_user_id` уникальный, `current_plan_status` (trial/active/expired/blocked/grace/canceled/pending), `timezone`, `current_period_end`, `grace_period_end`, `phone_number`, `daily_recommendations_enabled/_hour`.
- `categories` — system (user_id NULL, is_system=true) и пользовательские; partial unique индексы по `(kind, normalized_name)`.
- `subscriptions` — `is_current` partial unique per user, `status`, `trial_*`, `paid_*`, `payment_provider`. Триггер `sync_user_plan_status_from_subscription` пишет в `users.current_plan_status`.
- `user_sessions` — `(user_id unique, session_status, current_flow, current_step, context_json jsonb)`. Все pending драфты (transaction/bulk/delete/correction/recurring/billing-phone/chat-history) живут в `context_json`.
- `transactions` — `user_id`, `category_id`, `kind`, `amount integer > 0`, `transaction_date_local`, `transaction_at`, `parse_status` (draft/confirmed/corrected/deleted), `is_deleted`. Триггер `validate_transaction_category_and_fill_date` валидирует kind, ownership, заполняет `transaction_date_local` из user.timezone, синхронизирует soft-delete.
- `daily_recommendations` — unique `(user_id, recommendation_date_local)`, `delivery_status`.
- `admin_events` — лог.
- `telegram_update_receipts` — `update_id` PK, `status`, payload.
- `job_queue` — `id bigint`, `job_type`, `user_id null`, `payload_json`, `status`, `run_after`, `attempts/max_attempts`, `locked_at/by`.
- `mini_sessions` — `token_hash unique`, `expires_at` (24h).
- `payments` — `(provider, provider_invoice_id)` indexed, `status`, `amount_kzt`, ссылается на user.
- Ещё (миграции 002–010): `monthly_budgets`, `savings_goals`, `weekly_reports`, `recurring_expenses`, `category_hints` (cache), `category_aliases` (resolver fallback).

---

## Узкие места / TODO

> Свежие пункты в конце соответствующей категории. Файл:строка указывает на момент аудита и может смещаться после правок.

### 1. Производительность
- 🟡 `apps/bot-api/src/telegram/update-router.ts:40-211` — `dispatchText` последовательно опрашивает ~10 матчеров (billing-phone → export → help → budgets → goals → recurring → analytics → reset → correction → text-intake), у каждого может быть DB-запрос или OpenAI-fetch. Латентность хэндлера = сумма всех. Фикс: реестр `{matcher, handler}` с быстрой prefilter-ступенью (regex-токены) и параллельный keyword-классификатор.
- ✅ ~~🟡 session-draft два SELECT~~ — добавлен `getPendingDrafts(db, userId)` возвращающий `{single, bulk}` за один запрос. `handleTextMessage` использует его. Старые функции оставлены для совместимости с другими местами вызова.
- 🟡 `apps/bot-api/src/telegram/voice-intake/audio-converter.ts:18-25` — ffmpeg `spawn` без ограничения параллельности; всплеск голосовых сообщений → CPU/RAM спайк, может уронить контейнер на Render. Фикс: in-process semaphore (limit=2-3) или вынести в worker job.
- ✅ ~~🟡 нет таймаутов на fetch к OpenAI/Whisper/Telegram/Kaspi~~ — добавлен `AbortSignal.timeout` на горячий путь: Whisper 30s, OpenAI chat 15s, Telegram bot-api 10s (sendDocument 20s), Telegram worker sender 10s, Telegram getFile 10s, Telegram CDN download 30s, webhook-registration 10s, Kaspi createInvoice 15s / getInvoice 10s.
- 🟡 `packages/database/src/pool.ts:42` — `prepare:false` обязателен для PgBouncer transaction mode, но теряется кеш prepared statements. Тенденция OK, документировать в ADR.
- 🟢 `apps/worker/src/recurring-reminders/scheduler.ts` (запускается каждый тик ~5с) — убедиться что dedup в одном SQL-проходе и не сканит таблицу `transactions` целиком.

### 2. Надёжность
- ✅ ~~🔴 `billing-repository.ts:50-77` — `activateSubscription` без транзакции~~ — обёрнуто в `db.begin(...)`, оба UPDATE атомарны.
- ✅ ~~🟡 `voice-intake/handler.ts:85-146` — мёртвый `handleVoiceMessage`~~ — удалено.
- ✅ ~~🟡 `webhook-route.ts:78-84` — `markReceiptFailed` мог обрушить webhook~~ — обёрнуто в свой try/catch, "always 200" гарантировано.
- ✅ ~~🟡 нет ретраев на внешние fetch~~ — добавлен `fetchWithRetry` (`packages/shared`): 2 ретрая, exp back-off, ретраит 5xx/429/network. Подключён в Whisper, AI text-parser, AI analytics-parser, chat-handler (с tighter budget — 1 retry × 8s).
- ✅ ~~🟡 subscription-repository.ts redundant UPDATE~~ — `INSERT ... RETURNING id` теперь короткозамыкает: если строка не вставлена (существующий пользователь) — UPDATE на `users.current_period_end` пропускается. Экономит round-trip на каждое сообщение существующего юзера.
- ✅ ~~🟡 billing-webhook-route.ts rawBody fallback~~ — fail-closed: при отсутствии rawBody → 500 + лог "server misconfiguration", без `JSON.stringify` подмены.

### 3. Безопасность
- ✅ ~~🔴 mini-route.ts paywall~~ — `/auth` возвращает `state='paywall'` без выдачи токена; `requireMiniAuth` через `getMiniSessionContext` валидирует `current_plan_status` (`checkSubscriptionAccess`) на каждом запросе, статусы blocked/canceled/expired → 402; mini-shell умеет рендерить экран paywall.
- ✅ ~~🟡 mini-route.ts валидация date~~ — `?from=`/`?to=` проверяются по `^\d{4}-\d{2}-\d{2}$`, иначе 400.
- ✅ ~~🟡 mini-route.ts CORS fallback на `*`~~ — закрыто на уровне env validation: `parseEnv` теперь требует `TELEGRAM_MINIAPP_URL` при `NODE_ENV=production` (zod `superRefine`). В dev fallback на `*` остаётся для локального тестирования.
- ✅ ~~🟡 mini-auth.ts initData maxAge 24ч~~ — снижено до 1ч (3600s).
- 🟡 нет rate-limiting на `/telegram/webhook`, `/telegram/mini/*`, `/webhooks/billing`. Кто-то с правильным секретом или валидным initData может закидать. Фикс: `@fastify/rate-limit` с разумными лимитами.
- ✅ ~~🟡 text-intake без лимита длины ввода~~ — hard-cap 1000 символов в начале `handleTextMessage`. Новый `IntakeResult.kind='rejected'` короткозамыкает chat-fallback (не зовёт OpenAI). Защита от пасты длинных текстов и абьюза токенов.
- 🟢 `apps/admin-web/src/middleware.ts:10-27` — ручной base64-декодер для Edge runtime. `atob` доступен в Edge с 2022 — лишний код, заменимо на `atob(encoded)`.

### 4. Архитектура
- ✅ ~~🟡 update-router god-switch для текста~~ — реестр `TextHandler[]` в `dispatch/text-handlers.ts` + `runTextHandlers` в `dispatch/dispatcher.ts`. `dispatchText` теперь 10 строк (registry-walk + text-intake fallback). Добавление новой фичи = одна запись в `TEXT_HANDLERS`. callback_query-флоу пока остаётся switch-style (отдельная задача).
- ✅ ~~🟡 update-router billing-phone duplicate~~ — извлечён helper `tryHandleBillingPhone(text, chatId, userId, db, env, logger): Promise<boolean>`. Оба места (pre-gate в `case 'message'` и post-gate в `dispatchText`) теперь используют его. Структурно дубликата больше нет; обе точки нужны намеренно (гейт expired-юзеров vs voice-транскрипты).
- 🟡 `apps/bot-api/src/telegram/voice-intake/handler.ts` — `getVoiceTranscript` (актуальная) и `handleVoiceMessage` (мёртвая) — дублированный пайплайн.
- 🟡 `apps/bot-api/src/telegram/mini-app/mini-route.ts:202-244` — арифметика месяца (`new Date(year, mon, 1)`) дублирует логику `analytics/period-resolver.ts`. Фикс: расширить `period-resolver` на произвольный `YYYY-MM`.
- 🟡 `users.current_period_end` (миграция 008) и `subscriptions.paid_until/trial_end_at` (миграция 001) хранят одно и то же. Источник правды размазан, поддерживается app-кодом (`ensureTrialSubscription`, `activateSubscription`). Дрейф уже был замечен. Фикс: выбрать один источник.
- 🟡 `apps/bot-api/src/telegram/telegram-client.ts` (non-throwing, в bot-api) и `apps/worker/src/telegram/sender.ts` (throwing) — два параллельных Telegram-клиента. Можно вынести в `packages/telegram` с двумя режимами.
- 🟢 много репозиториев пишут SQL напрямую под `user_id`. На текущем размере OK, но фича "семейные аккаунты" потребует общего контракта `Scope = { userId } | { groupId }`.

### 5. Работа с БД
- ✅ ~~🔴 `activateSubscription` multi-statement без транзакции~~ — закрыто (см. №2).
- ✅ ~~🟡 нет индекса под `transaction_at DESC`~~ — миграция `20260507_014_transactions_at_index.sql` добавляет partial index `(user_id, transaction_at desc) WHERE is_deleted = false`. Применить через DEPLOY_RUNBOOK.
- 🟡 `payments.amount_kzt INTEGER` — OK для KZT, но если когда-нибудь пойдут USD/EUR с центами — потребуется decimal/`amount` + `currency_code` (как в transactions).
- 🟢 `transactions` без партиционирования и архивации; растёт безгранично. Не критично, добавить в roadmap (через 100k+ строк на пользователя).
- ✅ ~~🟢 mini_sessions cleanup~~ — `apps/worker/src/mini-sessions/cleanup.ts`: дроссель раз в час, удаляет `expires_at < now() - 7 days`. Подключено в worker tick после `recurring-reminders` и до `processJobs`. Best-effort: ошибки логируются и не блокируют другие шедулеры.

### 6. Render-специфика
- 🟡 admin-web Dockerfile + `render.yaml` entry отсутствуют (известно, см. PROJECT_STATE.md). Mini App и админка пока хостятся отдельно.
- 🟡 `apps/bot-api/src/main.ts:26-35` — webhook регистрируется ПЕРЕД `app.listen`. На холодном старте Render даёт ~2 минуты — успеваем, но если Telegram временно 500-ит, контейнер падает и Render ретраит. Можно сдвинуть регистрацию ПОСЛЕ `listen` (в фоне), чтобы health-чек прошёл сразу.
- 🟢 healthcheck `/` и `/health` отдают 200 — OK.
- 🟢 voice pipeline через stdin/stdout pipe — нет touch файловой системы → Render-friendly.

### 7. Голосовой ввод / STT
- ✅ ~~🟡 Whisper без `language` hint~~ — добавлен дефолтный `language='ru'` в `transcribeAudio` (параметр опциональный для будущего i18n).
- ✅ ~~🟡 нет лимита параллельных ffmpeg~~ — in-process semaphore `FFMPEG_MAX_CONCURRENT=3` с unbounded wait queue.
- ✅ ~~🟡 нет per-user квоты транскрипций~~ — таблица `voice_usage_daily(user_id, date_local, count)` (миграция 015), env `TRIAL_VOICE_DAILY_LIMIT=10` (active/grace/pending exempt), атомарный INSERT/ON CONFLICT WHERE гарантирует race-free инкремент. Счётчик растёт ДО Whisper (защита от абьюза). Сообщение об исчерпании зовёт оплатить через биллинг-команду.
- ✅ ~~🟡 нет per-message duration cap~~ — `getVoiceDurationLimit(planStatus, ...)` возвращает 180 сек на trial / 900 сек на paid (env `TRIAL_VOICE_MAX_DURATION_SEC` / `PAID_VOICE_MAX_DURATION_SEC`); проверяется ДО quota-инкремента и DB. `MAX_VOICE_FILE_SIZE_MB` дефолт снижен 20→10. Закрыта дыра `voice.file_size === undefined` (отказ вместо silent pass). Worst-case на trial-юзера: 10 файлов × 3 мин × $0.006 = ~$0.18/день (было ~$48/день при низком битрейте 20MB).
- 🟡 `MAX_VOICE_FILE_SIZE_MB=20` → ~3 минут аудио → ~$0.018 за один transcribe. Никаких per-user лимитов / квот → один пользователь может выжечь бюджет. Фикс: ежедневный лимит транскрипций на `current_plan_status='trial'` (например, 10/день).
- 🟢 `transcriber.ts:46` — на пустой transcript возвращает null без ретрая. Whisper иногда выдаёт пустоту на тихих записях; ретрай с подсказкой `prompt: "Это запись расхода…"` улучшил бы UX.

### 8. Mini App
- 🔴 нет проверки `current_plan_status` (см. №3.S1).
- ✅ ~~🟡 useMiniApp.ts 401 hot-loop~~ — добавлен `useRef` счётчик `MAX_AUTH_RETRIES=2`; после 2 неудачных re-auth подряд phase=`error` с понятным сообщением, счётчик сбрасывается на любом не-401 ответе.
- 🟡 нет CSP / `X-Frame-Options`. JSON-API сам по себе безопасен, но HTML mini-app должен иметь явные header'ы.
- 🟢 нет offline-режима / индикации потери сети — UX-полировка.
- 🟢 размер бандла Next.js не аудитен; `force-dynamic` рендеринг для админки — OK.

### 9. Тех долг / читаемость
- ✅ ~~`voice-intake/handler.ts` `handleVoiceMessage`~~ — удалено.
- ✅ ~~`analytics-repository.ts` `queryMonthTotal` + `queryCategoryBreakdown`~~ — удалены.
- ✅ ~~`mini-session.ts` старая `getMiniSessionUserId`~~ — удалена, заменена на `getMiniSessionContext`.
- 🟢 `packages/config/src/env.ts` vs `.env.example`: `OPENAI_MODEL` (`gpt-4o` vs `gpt-4.1-mini`), `MONTHLY_PRICE_KZT` (1490 vs 800), `TRIAL_DAYS` (8 vs 7), `JOB_POLL_INTERVAL_MS` (5000 vs 3000), `JOB_BATCH_SIZE` (25 vs 50). Дрейф; источник правды один.
- 🟢 `apps/bot-api/src/telegram/chat/chat-handler.ts:48-50` — `randomFallback` через `Math.random()`; тривиальная мелочь, но `?? DEFAULT_FALLBACK` лишний (индекс ограничен длиной массива). Можно упростить.
- 🟢 в `node_modules/.pnpm/` две версии `postgres` (3.4.5 и 3.4.8). Не критично, но ревизия pnpm-lock не помешает.
- ✅ ~~🟢 cross-field env validation~~ — `superRefine` теперь требует `KASPI_API_KEY` + `KASPI_WEBHOOK_SECRET` при `BILLING_PROVIDER=kaspi_qr` без test mode; `TELEGRAM_MINIAPP_URL` обязателен в prod.

### 10. Тестирование
- ✅ ~~🔴 ноль unit-тестов~~ — добавлен Vitest на root, **111 тестов / 8 файлов** покрывают чистые функции:
  - `parseIntakeText` (17 тестов) — парсер транзакций (RU/EN, граничные случаи)
  - `parseBulkInput` (13 тестов) — bulk-парсинг (delimiter strategies, mixed формат)
  - `validateAiResult` (21 тест) — LLM safety boundary (kind/amount/category валидация, NaN/Infinity reject)
  - `resolvePeriodRange` + `getLocalDate` (14 тестов) — таймзона-aware date arithmetic (today/yesterday/week/month, edge: Dec→Jan, Jan→Dec)
  - `verifyTelegramInitData` (15 тестов) — Mini App auth: HMAC, replay (1ч), tampering, malformed input
  - `fetchWithRetry` (13 тестов) — retry/timeout/back-off (5xx/429/network, exp delay capping, onRetry callback)
  - `checkSubscriptionAccess` (8 тестов) — gate всех plan статусов
  - voice quota helpers (10 тестов) — `planHasVoiceQuota` + `getVoiceDurationLimit` + форматтеры (включая RU comma-decimals)
- DB-зависимые функции не покрыты unit-тестами (нужна тест-БД); покрывается через `docs/CLOSED_SMOKE_TEST.md`.
- `pnpm test` (root) запускает `vitest run`, подключён в CI workflow перед typecheck.

### 11. Подготовка к семейным аккаунтам (см. Roadmap)
- 🟡 `supabase/migrations/20260322_001_init_schema.sql:328-371` — `transactions.user_id NOT NULL` без `group_id`. Будущая миграция: `ADD COLUMN group_id uuid NULL REFERENCES groups(id)`, `ADD COLUMN owner_user_id uuid NOT NULL DEFAULT user_id` + backfill.
- 🟡 `subscriptions` (миграция 001) и `users.current_period_end` (миграция 008) — оба keyed только на `user_id`. Семейный план потребует либо `subscription.group_id`, либо `groups.owner_user_id` (sub шарится со всех членов).
- 🟡 `sync_user_plan_status_from_subscription` (миграция 001) — триггер двигает `current_plan_status` только владельцу подписки. Семейный режим = fan-out на всех `group_members`. Фикс: переписать триггер на JOIN через `group_members`, либо денормализованно копировать статус при изменении.
- 🟡 `monthly_budgets`, `savings_goals`, `recurring_expenses` — все keyed на `user_id`. Решить: общие на группу или личные → флаг `scope text not null check (scope in ('personal','group'))` + опциональный `group_id`.
- 🟡 запросы аналитики (`apps/bot-api/src/telegram/analytics/analytics-repository.ts`) и Mini App API (`apps/bot-api/src/telegram/mini-app/mini-route.ts`) хардкодят `WHERE user_id = ${userId}`. Универсальный контракт: `Scope = { userId } | { groupId, memberFilter? }` — пройти все queries.
- 🟡 нет таблиц `groups`, `group_members`, `group_invites` — нужны для приглашения по коду, ролей (owner/member), флага дублирования сообщений.
- 🟢 `categories` уже разделены (`is_system` global vs `user_id` private). Для гибридного режима нужно `scope text` (`personal/group/shared`) и `group_id null`.

---

## Где остановились

**Сессия 2026-05-07.** Все 10 этапов плана из `docs/PROJECT_STATE.md` приняты и задеплоены. Аудит выявил 3 🔴 и ~30 🟡/🟢. Закрыто:

**Первая итерация:**
- ✅ **S1** — Mini App paywall: `getMiniSessionContext` JOIN'ит `users`, `requireMiniAuth` отдаёт 402 для blocked/canceled/expired, `/auth` возвращает `state='paywall'` без выдачи токена; UI отображает экран paywall; на 402 в `loadData` возвращаем фронт в paywall-флоу.
- ✅ **R1** — `activateSubscription` обёрнута в `db.begin(...)`.
- ✅ **P4** — `AbortSignal.timeout` на 15+ fetch'ах в горячем пути.
- ✅ **T1 + T2** — удалены `handleVoiceMessage`, `queryMonthTotal`, `queryCategoryBreakdown`, старая `getMiniSessionUserId`.
- ✅ **S5** — `/mini/transactions ?from=&to=` валидируется по `YYYY-MM-DD`.

**Вторая итерация:**
- ✅ **R2** — `fetchWithRetry` в `packages/shared` (timeout + exp back-off + ретрай 5xx/429/network); подключён в Whisper / AI text-parser / AI analytics-parser / chat-handler. `@aqsha-ai/shared` теперь зависит от `@types/node`, добавлен в bot-api dependencies.
- ✅ **R3** — `markReceiptFailed`/`markReceiptProcessed` в защищённом try/catch; webhook гарантированно возвращает 200.
- ✅ **S3** — initData `maxAgeSeconds` 24ч → 1ч.
- ✅ **S4** — billing webhook fail-closed: при отсутствии rawBody → 500 (без подмены `JSON.stringify`).
- ✅ **V1** — Whisper `language='ru'` (быстрее, точнее, ~10-15% дешевле).
- ✅ **DB1** — миграция `20260507_014_transactions_at_index.sql`: partial index `(user_id, transaction_at desc) WHERE is_deleted=false`. Применить через DEPLOY_RUNBOOK.
- ✅ **P3** — semaphore (max 3 concurrent) для ffmpeg-процессов; защита от OOM на Render.

`pnpm typecheck` ✓, `pnpm build` ✓ для всех 6 проектов.

**Третья итерация:**
- ✅ **V3** — per-user voice quota: миграция `20260507_015_voice_usage_daily.sql`, env `TRIAL_VOICE_DAILY_LIMIT=10`, `voice-intake/quota.ts` (атомарный consume через ON CONFLICT WHERE), wired в `update-router.ts:voice` после access-gate. Лимит на trial-юзера, остальные exempt.
- ✅ **V3.5** — per-message duration cap + закрытие дыры с `file_size`: `TRIAL_VOICE_MAX_DURATION_SEC=90` (1,5 мин) / `PAID_VOICE_MAX_DURATION_SEC=900` (15 мин), дефолт `MAX_VOICE_FILE_SIZE_MB` 20→10. Чек длительности перед quota-инкрементом. `getVoiceTranscript` теперь refuse'ит при отсутствующем `file_size`. Worst-case на trial: 10 файлов × 1,5 мин = $0.09/день.

**Четвёртая итерация:**
- ✅ **A2** — cross-field env validation через zod `superRefine`: `BILLING_PROVIDER=kaspi_qr` без test mode требует `KASPI_API_KEY` и `KASPI_WEBHOOK_SECRET`; `NODE_ENV=production` требует `TELEGRAM_MINIAPP_URL`. Misconfig падает на старте, а не на первом вебхуке/MiniApp-запросе.
- ✅ **Text length cap** — hard-cap 1000 символов в `handleTextMessage`. Новый `IntakeResult.kind='rejected'` (короткозамыкает chat-fallback). Защита от выжигания OpenAI-токенов длинными вставками.

**Пятая итерация:**
- ✅ **TST1** — Vitest + 111 unit-тестов на 8 файлов, покрытие критичных чистых функций (см. раздел 10 выше). Подключено в CI перед typecheck. Test runtime: ~450ms full suite. Готовый каркас для дальнейшего расширения покрытия.

**Шестая итерация (мелкие wins):**
- ✅ **session-draft single SELECT** — `getPendingDrafts` за один round-trip (вместо двух).
- ✅ **ensureTrialSubscription dedup** — пропуск follow-up UPDATE для существующих юзеров через `RETURNING id`.
- ✅ **mini_sessions cleanup** — почасовой воркер-таск, удаляет токены `expires_at < now() - 7 days`.
- ✅ **useMiniApp 401-loop guard** — `MAX_AUTH_RETRIES=2`, после исчерпания phase='error'.
- ✅ **update-router billing-phone DRY** — helper `tryHandleBillingPhone`, оба call-site используют его.
- ✅ **Тестов**: +4 в `quota-format.test.ts` для граничных значений (boundary 60s, 59s, 150s).

**Седьмая итерация:**
- ✅ **A1 (text dispatcher)** — реестр `TextHandler[]` для текстовых сообщений:
  - `dispatch/types.ts`: `TextHandler`, `HandlerOutput` (`pass | sent | reply`), `TextDispatchContext`.
  - `dispatch/text-handlers.ts`: 9 хэндлеров (billing-phone, export, help, budget, goal, recurring, analytics, reset, correction) — тонкие обёртки вокруг существующих функций; `stringHandler` фабрика для `string | null` сигнатур; единый error-path → дружелюбный fallback-текст.
  - `dispatch/dispatcher.ts`: `dispatchTextMessage(ctx, handlers)` (тестируемая чистая функция) + `runTextHandlers(ctx, handlers)` (sender wrapper).
  - `update-router.ts:dispatchText` теперь ~10 строк (раньше ~140): прогон по реестру → text-intake fallback с budget-alert логикой остаётся inline (его побочки сложнее, чем влезает в `HandlerOutput`).
  - Добавление новой фичи (например, групповая команда для семейных аккаунтов) = одна запись в `TEXT_HANDLERS`.
  - +6 тестов в `dispatch/dispatcher.test.ts`: order, short-circuit, exception propagation, reply pass-through.

`pnpm typecheck` ✓, `pnpm build` ✓.

**Что осталось (impact / effort):**

1. **🟡 A1.5 (callback dispatcher)** — реестр для callback_query (сейчас всё ещё switch со многими ветками `confirm`/`del_yes`/`rec_*`/etc). ~2 часа. Доразвитие седьмой итерации.
2. **🟡 Расширить тесты на DB-функции** — `tryConsumeVoiceQuota`, `activateSubscription` rollback (нужна testcontainers Postgres или Supabase test branch). ~3 часа.
3. **🟡 Rate limiting** — `@fastify/rate-limit` на `/telegram/webhook`, `/telegram/mini/*`, `/webhooks/billing`. ~1 час.
4. **🟢 RN1** — Dockerfile + render.yaml entry для admin-web. ~2 часа.

**Деплой-чеклист (после ревью):**
- Применить миграции через Supabase SQL Editor (порядок важен):
  1. `20260507_014_transactions_at_index.sql` (индекс ускорит ORDER BY transaction_at)
  2. `20260507_015_voice_usage_daily.sql` (таблица квот; нужна ДО деплоя bot-api с новой логикой)
- На Render задать `TRIAL_VOICE_DAILY_LIMIT=10` (или нужное значение)
- Задеплоить bot-api + worker (новые зависимости: `@aqsha-ai/shared` в bot-api, `@types/node` в shared)
- Mini App: пользователи в blocked/expired увидят экран paywall — проверить продуктово
- Voice quota: trial-юзер на 11-й голосовой за день получает сообщение «достигнут лимит»

---

## Roadmap / Семейные аккаунты

> Спецификация — НЕ реализуем сейчас. Цель: подготовить почву по мере правок других задач (см. категорию 11 в TODO).

### Цель
Главный (owner) аккаунт может пригласить до **2 дополнительных** участников (всего 3 человека на группу). Подписка одна и шарится. Аналитика — гибкая (личное / группа / конкретный участник).

### Функционал
- **Создание группы:** owner получает invite-код / one-time-link; участник принимает в боте → его user_id привязывается к `group_id`.
- **Лимит:** до 2 участников (3 включая owner).
- **Режимы группы** (выбирает owner, можно менять):
  - **Общий бюджет ON/OFF** — все траты/доходы участников идут в общий котёл и общую аналитику.
  - **Личный режим** — у каждого свой бюджет, но видна общая статистика по запросу.
  - **Гибрид** — категории помечаются как `personal` или `group_shared`.
- **Дублирование сообщений:** опциональная галочка "копировать мои операции в чат участников группы" (per-member).
- **Подписка:** одна оплаченная подписка owner'а распространяется на всю группу. При уходе участника (`leave_group`) — его данные **сохраняются** (FK не каскадит), но `group_id` сбрасывается.
- **Права:** owner — полный CRUD группы; member — добавление/правка своих операций, просмотр общих по разрешению; пригласить других не может.
- **Mini App:** переключатель "Личное / Группа / Конкретный участник" сверху аналитики; экран "Управление группой" виден только owner'у.

### Влияние на схему данных (что нужно учесть)
1. **Новые таблицы:** `groups (id, owner_user_id, mode 'shared'|'personal'|'hybrid', created_at)`, `group_members (group_id, user_id, role 'owner'|'member', mirror_messages bool, joined_at)`, `group_invites (id, group_id, code unique, created_by, expires_at, used_by null, used_at null)`.
2. **`users.group_id uuid null`** — denormalized указатель на текущую группу (фактически дублирует `group_members`, но ускоряет горячий путь webhook).
3. **`transactions`** — добавить `group_id uuid null`, `owner_user_id uuid null` (= кто реально записал). Backfill: `group_id=null`, `owner_user_id=user_id`.
4. **`subscriptions`** — добавить `group_id uuid null` ИЛИ оставить keyed только на owner'а и читать через `groups.owner_user_id`. Решение зависит от триггера sync.
5. **Триггер `sync_user_plan_status_from_subscription`** — переписать: на изменение подписки owner'а обновлять `current_plan_status` всем членам группы. Альтернатива: вьюха `effective_subscriptions`.
6. **`monthly_budgets`, `savings_goals`, `recurring_expenses`** — добавить `scope text check (scope in ('personal','group'))` + `group_id uuid null`.
7. **`categories`** — добавить `scope text check (scope in ('system','personal','group'))` + `group_id uuid null` (для общегрупповых категорий).
8. **Уникальные индексы:** убедиться что `uq_categories_user_kind_normalized` не ломается при добавлении группового скопа.

### Влияние на код (заранее не менять, но помнить)
- `update-router.ts` / `dispatchText` должен знать **контекст owner'а** (от чьего имени операция и в какую группу пишем). Сейчас всё на `userId` — потребуется `Scope`.
- `analytics/analytics-repository.ts`, `mini-app/mini-route.ts` — все queries добавляют `WHERE (t.user_id = ${userId} OR t.group_id = ${groupId})` с фильтром по выбранному mode.
- `worker/daily-recommendations/scheduler.ts` — отправлять рекомендацию персонально (member) или агрегировать по группе (owner) — уточнить продуктово.
- `text-intake/transaction-inserter.ts` — заполнять `owner_user_id` и `group_id` из контекста.
- `mini-app/mini-route.ts` `/data` и `/analytics` — параметр `?scope=personal|group|member:UUID`.
- Echo/mirror-сообщений — отдельный воркер-job `mirror_message`, который рассылает в чаты других members (учесть rate-limit Telegram).

### Что делать СЕЙЧАС
Пока НЕ пишем groups/members. Но при любых правках затрагиваемых файлов:
- Не делать SQL вида `WHERE user_id = $1 AND ...` без оборачивания в helper, который потом легко расширить до `Scope`.
- Не добавлять новые `user_id`-колонки в новые таблицы без `group_id` placeholder и `scope` колонки.
- Не делать новые триггеры с прямым lookup в `users` — учитывать будущую денормализацию через `group_members`.

См. категорию 11 в `## Узкие места / TODO` — там перечислены конкретные точки кода, которые помешают этой фиче.
