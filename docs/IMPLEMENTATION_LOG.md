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

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓ (skeleton only)

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

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓ (webhook foundation)

---

## current baseline — Telegram Update Routing + User Bootstrap (apps/bot-api)

**Task:** Implement update routing foundation and user/session/subscription bootstrap.

**Result:** Incoming updates are routed by type. On every user-originated update, the app upserts the user, ensures a session row, and ensures a trial subscription exists.

**Files affected:**
- `apps/bot-api/src/telegram/users-repository.ts` (new — `upsertUser`, ON CONFLICT DO UPDATE, COALESCE language_code)
- `apps/bot-api/src/telegram/session-repository.ts` (new — `ensureUserSession`, ON CONFLICT DO NOTHING)
- `apps/bot-api/src/telegram/subscription-repository.ts` (new — `ensureTrialSubscription`, ON CONFLICT DO NOTHING, make_interval)
- `apps/bot-api/src/telegram/user-bootstrap-service.ts` (new — `bootstrapUser`, orchestrates the three repositories)
- `apps/bot-api/src/telegram/update-router.ts` (new — `routeTelegramUpdate`, routes message/voice/callback_query/edited_message/unknown)
- `apps/bot-api/src/telegram/update-handler.ts` (modified — added `env` param, delegates to router)
- `apps/bot-api/src/telegram/webhook-route.ts` (modified — passes `env` to handler)
- `packages/config/src/env.ts` (modified — `TELEGRAM_WEBHOOK_SECRET` made optional, restoring accepted contract)

**Key behavior:**
- Bot-originated updates skipped from bootstrap (`!from.is_bot`)
- Unsupported update types logged and ignored without failure
- All three bootstrap operations are idempotent
- `trg_subscriptions_sync_user_plan` trigger keeps `users.current_plan_status` in sync automatically

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/config build` ✓, `pnpm --filter @aqsha-ai/database build` ✓, `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## current baseline — Text Transaction Intake Foundation (apps/bot-api)

**Task:** Implement deterministic draft/confirmation flow for simple text transaction intake.

**Result:** Text messages matching `<kind> <amount> <category>` create a pending draft in `user_sessions.context_json`. Explicit confirmation inserts the transaction; cancellation clears the draft. Unrecognised input returns a safe fallback boundary.

**Files affected:**
- `apps/bot-api/src/telegram/text-intake/parser.ts` (new — narrow format parser, integer-only amount guard)
- `apps/bot-api/src/telegram/text-intake/category-resolver.ts` (new — user category first, system fallback, matched by `normalized_name`)
- `apps/bot-api/src/telegram/text-intake/session-draft.ts` (new — `getPendingDraft`, `setPendingDraft`, `clearPendingDraft` via JSONB `||` and `-` operators)
- `apps/bot-api/src/telegram/text-intake/transaction-inserter.ts` (new — `insertConfirmedTransaction`, `source_type='text'`, `parse_status='confirmed'`)
- `apps/bot-api/src/telegram/text-intake/response.ts` (new — `IntakeResult` discriminated union)
- `apps/bot-api/src/telegram/text-intake/handler.ts` (new — `handleTextMessage`, orchestrates all of the above)
- `apps/bot-api/src/telegram/update-router.ts` (modified — `'message'` case now calls `handleTextMessage`, captures `userId` from bootstrap result)

**Key behavior:**
- Supported kind tokens: расход/доход/expense/income + aliases
- Amount must be a pure positive integer (regex `^\d+$`)
- Category resolved by `normalized_name`; user category preferred over system
- Draft stored under `context_json.pendingTransaction`; session_status set to `awaiting_confirmation`
- On confirm: transaction inserted, draft cleared, session_status reset to `idle`
- On cancel: draft cleared, nothing inserted
- On unknown text with active draft: treated as new intake attempt (draft replaced if valid)
- DB trigger fills `transaction_date_local` automatically from user timezone

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/config build` ✓, `pnpm --filter @aqsha-ai/shared build` ✓, `pnpm --filter @aqsha-ai/database build` ✓, `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓
