# Implementation Log

> Factual record of completed and accepted implementation work.
> Do not add entries for work that has not been verified and accepted.
> Keep entries short. One entry per completed task.

---

## 2026-03-22 — DB Schema v1 Baseline

**Task:** Create initial database schema migration.

**Result:** Single migration file establishes v1 schema baseline.

**Files affected:**
- `supabase/migrations/20260322_001_init_schema.sql`

**Tables created:** `users`, `categories`, `subscriptions`, `user_sessions`, `transactions`, `daily_recommendations`, `admin_events`, `telegram_update_receipts`, `job_queue`

**Also included:** triggers (`set_updated_at`, `sync_user_plan_status_from_subscription`, `validate_transaction_category_and_fill_date`), system category seed (18 rows), pgcrypto extension.

**Verification:** Migration file reviewed and accepted as v1 baseline. Not run against live DB yet.

---

## 2026-03-22 — @aqsha-ai/config Package

**Task:** Implement shared environment variable validation package.

**Result:** Zod-based env schema with `parseEnv()` and `AppEnv` type.

**Files affected:**
- `packages/config/package.json`
- `packages/config/tsconfig.json` (pre-existing, unchanged)
- `packages/config/src/env.ts`
- `packages/config/src/index.ts`

**Key exports:** `parseEnv(env?)`, `AppEnv`

**Dependencies added:** `zod ^3.23.8`, `@types/node ^22.0.0`

**Env vars covered:** 27 variables across runtime, app, Telegram, database, OpenAI, voice, jobs, admin, logging, billing groups.

**Verification:** `pnpm --filter @aqsha-ai/config typecheck` ✓, `pnpm --filter @aqsha-ai/config build` ✓

---

## current baseline — @aqsha-ai/shared Package

**Task:** Implement shared domain enums and types package.

**Result:** 10 domain const-object enums with union types and readonly arrays, values matching DB CHECK constraints exactly.

**Files affected:**
- `packages/shared/package.json`
- `packages/shared/src/enums.ts`
- `packages/shared/src/index.ts`

**Key exports:** `TransactionKind`, `CategoryKind`, `SubscriptionStatus`, `SessionStatus`, `ParseStatus`, `SourceType`, `JobStatus`, `DeliveryStatus`, `EventSource`, `EventSeverity` — each as const object + union type + readonly array.

**Dependencies added:** `typescript ^5.4.5` devDep only. No runtime deps.

**Verification:** `pnpm --filter @aqsha-ai/shared typecheck` ✓, `pnpm --filter @aqsha-ai/shared build` ✓

---

## current baseline — @aqsha-ai/database Package

**Task:** Implement database connection layer package.

**Result:** postgres.js-based pool factory with config-aware helpers.

**Files affected:**
- `packages/database/package.json`
- `packages/database/src/pool.ts`
- `packages/database/src/connection.ts`
- `packages/database/src/index.ts`

**Key exports:** `createDbPool(connectionString, options?)`, `closeDbPool(pool)`, `createDbPoolFromEnv(env, mode?, options?)`, `getDatabaseConnectionString(env, mode)`, `DbPool`, `DbPoolOptions`, `DatabaseConnectionMode`

**Dependencies added:** `postgres ^3.4.4`, `@aqsha-ai/config workspace:*`

**Important:** `prepare: false` is set on all pools — required for Supabase PgBouncer in transaction mode.

**Verification:** `pnpm --filter @aqsha-ai/database typecheck` ✓, `pnpm --filter @aqsha-ai/database build` ✓

---

## current baseline — apps/bot-api Skeleton

**Task:** Implement initial HTTP service skeleton for the Telegram webhook backend.

**Result:** Fastify v5 service with health route, env-aware startup, and graceful shutdown.

**Files affected:**
- `apps/bot-api/package.json`
- `apps/bot-api/tsconfig.json` (added `paths: {}` override)
- `apps/bot-api/src/app.ts`
- `apps/bot-api/src/main.ts`

**Behavior:**
- `parseEnv()` on startup
- `createDbPoolFromEnv(env)` on startup
- `GET /health` → `{ status, service, env }`
- SIGTERM / SIGINT → `app.close()` → `closeDbPool()` → exit 0
- Listens on `0.0.0.0:APP_PORT`

**Dependencies added:** `fastify ^5.0.0`, `tsx ^4.19.0 (dev)`

**Note:** `paths: {}` in tsconfig overrides base path aliases. Bot-api resolves workspace packages through node_modules (built dist), not source. Packages must be built before typechecking the app.

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## current baseline — apps/worker Skeleton

**Task:** Implement initial background worker service skeleton.

**Result:** Long-running poll loop process with pino logging, tick concurrency guard, and graceful shutdown.

**Files affected:**
- `apps/worker/package.json`
- `apps/worker/tsconfig.json` (added `paths: {}` override)
- `apps/worker/src/app.ts`
- `apps/worker/src/main.ts`

**Behavior:**
- `parseEnv()` on startup
- `createDbPoolFromEnv(env)` on startup
- Tick fires every `JOB_POLL_INTERVAL_MS` (default 5000ms)
- Concurrent ticks skipped with warn log
- SIGTERM / SIGINT → `worker.stop()` → drain in-progress tick → `closeDbPool()` → exit 0

**Dependencies added:** `pino ^9.0.0`, `tsx ^4.19.0 (dev)`

**Note:** Same `paths: {}` tsconfig pattern as bot-api. No HTTP port — Render "Background Worker" service type.

**Verification:** `pnpm --filter @aqsha-ai/worker typecheck` ✓, `pnpm --filter @aqsha-ai/worker build` ✓

---

## current baseline — Telegram Webhook Foundation (apps/bot-api)

**Task:** Implement Telegram webhook receiver with deduplication and placeholder dispatcher.

**Result:** `POST /telegram/webhook` registered in bot-api. Validates secret header, deduplicates by `update_id` via `telegram_update_receipts`, dispatches to placeholder `handleTelegramUpdate`, always returns `{ ok: true }` to Telegram.

**Files affected:**
- `apps/bot-api/src/app.ts` (registered webhook plugin, activated `db` param)
- `apps/bot-api/src/telegram/types.ts` (new — minimal Telegram update types + extractors)
- `apps/bot-api/src/telegram/receipt-repository.ts` (new — `insertOrIgnoreReceipt`, `markReceiptProcessed`, `markReceiptFailed`)
- `apps/bot-api/src/telegram/update-handler.ts` (new — placeholder `handleTelegramUpdate` dispatcher)
- `apps/bot-api/src/telegram/webhook-route.ts` (new — Fastify plugin factory)

**Key behavior:**
- `TELEGRAM_WEBHOOK_SECRET` checked when set; skipped if unset (local dev)
- `ON CONFLICT (update_id) DO NOTHING` prevents duplicate processing
- Receipt marked `received` → `processed` or `failed` after dispatch
- Always returns 200 to Telegram — errors are recorded in DB, not retried

**Dependencies added:** none

**Follow-up fix:** `db.json(data.payloadJson as any)` — postgres.js `JSONValue` internal type not satisfiable from user code; `as any` is the correct minimal cast.

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓
