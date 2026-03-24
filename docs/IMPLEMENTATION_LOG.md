# Implementation Log

> Factual record of completed and accepted implementation work.
> Do not add entries for work that has not been verified and accepted.
> Keep entries short. One entry per completed task.
>
> Archiving: when this file becomes too large, older entries are moved to
> docs/archive/IMPLEMENTATION_LOG_archive_NNN.md. Do not delete history.

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

---

## current baseline — Telegram Outbound Sending Foundation (apps/bot-api)

**Task:** Implement outbound text message sending to Telegram users.

**Result:** `telegram-client.ts` provides `sendMessage` using native fetch. Wired into `update-router.ts` so text intake results are delivered to the user's chat after every handled message.

**Files affected:**
- `apps/bot-api/src/telegram/telegram-client.ts` (new — `sendMessage`, three-layer error handling: network / HTTP / API errors)
- `apps/bot-api/src/telegram/update-router.ts` (modified — calls `sendMessage` with `msg.chat.id` and `result.message` after text intake)

**Key behavior:**
- Uses `TELEGRAM_BOT_TOKEN` from env; token never appears in logs
- All error paths log and return without throwing — outbound failures do not crash webhook handler
- Every `IntakeResult` variant has `message: string`; no adapter switch needed at call site

**Dependencies added:** none (native `fetch`, Node 22+)

**Verification:** `pnpm --filter @aqsha-ai/config build` ✓, `pnpm --filter @aqsha-ai/shared build` ✓, `pnpm --filter @aqsha-ai/database build` ✓, `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## current baseline — Voice Intake Pipeline (apps/bot-api)

**Task:** Implement voice message transcription and intake pipeline.

**Result:** Voice messages are downloaded from Telegram, converted to MP3 via ffmpeg, transcribed with OpenAI Whisper, and fed into the existing `handleTextMessage` handler. The draft/confirm flow is reused without duplication.

**Files affected:**
- `apps/bot-api/src/telegram/voice-intake/file-fetcher.ts` (new — `getFilePath`, `downloadVoiceFile`)
- `apps/bot-api/src/telegram/voice-intake/audio-converter.ts` (new — `convertToMp3`, ffmpeg stdin→stdout pipe, no temp files)
- `apps/bot-api/src/telegram/voice-intake/transcriber.ts` (new — `transcribeAudio`, native fetch + FormData, Whisper API)
- `apps/bot-api/src/telegram/voice-intake/handler.ts` (new — `handleVoiceMessage`, orchestrates pipeline)
- `apps/bot-api/src/telegram/update-router.ts` (modified — `'voice'` case wired to `handleVoiceMessage` + `sendMessage`)

**Key behavior:**
- Size guard rejects files larger than `MAX_VOICE_FILE_SIZE_MB` before any API call
- ffmpeg args: `-i pipe:0 -f mp3 -vn -ar 16000 -ac 1 pipe:1` (mono 16 kHz, no temp files)
- Whisper called with `response_format=text` — returns plain string, no JSON parsing needed
- Synthetic `TelegramMessage` constructed from transcript to pass into `handleTextMessage`
- Ambiguous voice parse triggers confirmation flow via existing session draft mechanism
- All pipeline stages return null on failure; each has its own user-facing error message

**Dependencies added:** none (native `fetch`, `FormData`, `child_process` from Node stdlib)

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## current baseline — Analytics Query Foundation (apps/bot-api)

**Task:** Implement deterministic analytics query layer for Telegram users.

**Result:** Six analytics query types wired into the message routing path. The bot now answers a narrow set of finance questions using SQL queries with no LLM involvement. Analytics queries take priority over text intake in the message handler.

**Files affected:**
- `apps/bot-api/src/telegram/analytics/query-matcher.ts` (new — `matchAnalyticsQuery`, 13 exact-match tokens → 6 query types)
- `apps/bot-api/src/telegram/analytics/analytics-repository.ts` (new — `queryBalance`, `queryMonthTotal`, `queryCategoryBreakdown`, `queryRecentTransactions`)
- `apps/bot-api/src/telegram/analytics/formatter.ts` (new — plain-text formatters, amounts via `toLocaleString('ru-RU') + ' ₸'`)
- `apps/bot-api/src/telegram/analytics/handler.ts` (new — `handleAnalyticsQuery`, returns `string | null`)
- `apps/bot-api/src/telegram/update-router.ts` (modified — `'message'` case calls `handleAnalyticsQuery` before `handleTextMessage`; null return falls through)

**Supported queries:** баланс / balance, расходы / расходы за месяц, доходы / доходы за месяц, категории расходов, категории доходов, последние операции / история

**Key behavior:**
- All queries filter `is_deleted = false AND parse_status = 'confirmed'`
- Monthly scope uses `transaction_date_local` (user's local date, already filled by DB trigger)
- SUM results are PostgreSQL `bigint`, converted with `Number()` before formatting
- Handler returns error string (not throw) on DB failure — no webhook crash
- Voice messages automatically reach analytics via the existing transcript → `handleTextMessage` path

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## current baseline — Worker Job Queue Foundation (apps/worker)

**Task:** Implement job queue claiming and processing foundation in the worker service.

**Result:** The worker now claims and processes jobs from `public.job_queue` on every poll tick. Job state transitions are explicit. Unknown job types are safely handled. A `noop` handler validates the full pipeline end-to-end.

**Files affected:**
- `apps/worker/src/job-queue/types.ts` (new — `JobRow`, `JobHandler`, `JobContext`)
- `apps/worker/src/job-queue/repository.ts` (new — `claimNextJob`, `markJobDone`, `markJobFailed`)
- `apps/worker/src/job-queue/registry.ts` (new — handler map, `getHandler`)
- `apps/worker/src/job-queue/processor.ts` (new — `processJobs`, claims up to `JOB_BATCH_SIZE` per tick)
- `apps/worker/src/job-queue/handlers/noop.ts` (new — `noopHandler` for `'noop'` job type)
- `apps/worker/src/app.ts` (modified — removed `_db` stub, wired `processJobs(db, env, logger)` into tick)

**Key behavior:**
- Claiming: `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` — single atomic statement, safe for concurrent workers
- Claim increments `attempts`, sets `status='processing'`, sets `locked_at` and `locked_by`
- Unknown job type → `status='failed'`, `last_error` = "Unknown job type: <type>"
- Handler throws → `status='failed'`, `last_error` = error message
- Handler returns → `status='done'`
- `attempts >= max_attempts` → job is never claimed again (filter in claim query)
- `set_updated_at` trigger updates `updated_at` automatically on all status changes
- One job failure does not abort processing of subsequent jobs in the same tick

**Manual test path:** Insert a `noop` job via SQL, observe worker log output showing "noop job executed" and "Job done":
```sql
INSERT INTO public.job_queue (job_type, status, run_after)
VALUES ('noop', 'pending', now());
```

**Dependencies added:** none (pino already in worker deps)

**Verification:** `pnpm --filter @aqsha-ai/worker typecheck` ✓, `pnpm --filter @aqsha-ai/worker build` ✓

---

## 2026-03-23 — Daily Recommendation Foundation (apps/worker)

**Task:** Implement daily recommendation generation and delivery stub job handlers in the worker service.

**Result:** Worker can generate deterministic daily recommendations from SQL and enqueue delivery stub jobs. The full generate-then-deliver pipeline is wired through the job registry.

**Files affected:**
- `apps/worker/src/daily-recommendations/repository.ts` (new — `findUser`, `calculateDailyStats`, `insertRecommendationIfNew`, `findRecommendation`, `markRecommendationSkipped`, `enqueueDeliveryJob`)
- `apps/worker/src/daily-recommendations/calculator.ts` (new — `calculateDaysRemaining`, `calculateSafeDailySpend`)
- `apps/worker/src/daily-recommendations/formatter.ts` (new — `formatRecommendationMessage`, plain-text 5-line format)
- `apps/worker/src/daily-recommendations/handlers/generate.ts` (new — `dailyRecommendationGenerateHandler` for job type `daily_recommendation_generate`)
- `apps/worker/src/daily-recommendations/handlers/deliver-stub.ts` (new — `dailyRecommendationDeliverStubHandler` for job type `daily_recommendation_deliver_stub`)
- `apps/worker/src/job-queue/registry.ts` (modified — both handlers registered)

**Key behavior:**
- Generate handler: validates user (active, recommendations enabled, plan not expired/blocked) → calculates stats via two SQL queries → formats message → `ON CONFLICT DO NOTHING RETURNING id` insert → enqueues deliver-stub job only on first insert (idempotent)
- Stats: balance = all-time income minus expense; month totals scoped by `transaction_date_local` in user's timezone
- Safe daily spend: `Math.floor(balance / daysRemaining)`, clamped to 0 if balance ≤ 0, daysRemaining clamped to min 1
- Deliver-stub handler: loads recommendation, guards on non-pending status, marks `delivery_status='skipped'` with reason `'delivery_not_implemented'`; real delivery replaces this stub
- `db.json(payload as any)` pattern used for JSONB insertion (established project pattern)

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/worker typecheck` ✓, `pnpm --filter @aqsha-ai/worker build` ✓

---

## 2026-03-23 — Real Telegram Delivery from Worker (apps/worker)

**Task:** Replace delivery stub with real Telegram message delivery from the worker service.

**Result:** Worker now sends daily recommendation messages directly to users via the Telegram Bot API. Delivery state is tracked deterministically in `daily_recommendations`.

**Files affected:**
- `apps/worker/src/telegram/sender.ts` (new — `sendTelegramMessage`, throws on all failure modes to enable job-level retry)
- `apps/worker/src/daily-recommendations/repository.ts` (modified — added `DeliveryUserRecord`, `findUserForDelivery`, `markRecommendationSent`, `markRecommendationFailed`; updated `enqueueDeliveryJob` to use job type `daily_recommendation_deliver`)
- `apps/worker/src/daily-recommendations/handlers/deliver.ts` (new — `dailyRecommendationDeliverHandler` for job type `daily_recommendation_deliver`)
- `apps/worker/src/job-queue/registry.ts` (modified — registered `daily_recommendation_deliver` handler; `deliver-stub` kept for backward compat)

**Key behavior:**
- Delivery target: `users.telegram_user_id` is used as Telegram `chat_id` (correct for private bot chats)
- Idempotency: `sent` and `skipped` statuses skip delivery; `pending` and `failed` both proceed (failed enables retry)
- User inactive at delivery time → mark recommendation `skipped`, job done
- Telegram failure → mark recommendation `failed`, re-throw so job processor marks job failed and retries
- Success → `delivery_status='sent'`, `delivered_at=now()`, `error_text=null`
- `deliver-stub` job type remains registered for any previously queued stub jobs

**Dependencies added:** none (native `fetch`, Node 22+)

**Verification:** `pnpm --filter @aqsha-ai/worker typecheck` ✓, `pnpm --filter @aqsha-ai/worker build` ✓

---

## 2026-03-23 — Daily Recommendation Scheduling Foundation (apps/worker)

**Task:** Implement the scheduling layer that automatically enqueues daily recommendation generation jobs for eligible users at their configured local hour.

**Result:** Worker now scans eligible users on every tick and enqueues `daily_recommendation_generate` jobs automatically. The full recommendation pipeline (schedule → generate → deliver) is operational end-to-end.

**Files affected:**
- `apps/worker/src/daily-recommendations/scheduler.ts` (new — `findUsersNeedingGenerationJob`, `enqueueGenerationJob`, `runDailyRecommendationScheduler`)
- `apps/worker/src/app.ts` (modified — `runDailyRecommendationScheduler` called before `processJobs` in tick)

**Key behavior:**
- Single SQL pass over `users` with all eligibility and dedup conditions in `WHERE`
- Eligibility: `is_active = true`, `daily_recommendations_enabled = true`, `timezone <> ''`, current local hour `>=` `daily_recommendations_hour`
- Dedup guard 1: no `daily_recommendations` row for today's local date (uses per-user timezone via `AT TIME ZONE`)
- Dedup guard 2: no `daily_recommendation_generate` job in `pending`/`processing` state created since UTC midnight today
- Per-user enqueue failures are caught and logged; one failure does not abort the scheduler pass
- Scheduler query failure is caught at the top level and logged; job processing tick still runs

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/worker typecheck` ✓, `pnpm --filter @aqsha-ai/worker build` ✓

---

## 2026-03-23 — Docker / Render Production Packaging

**Task:** Package both services for production deployment on Render via Docker.

**Result:** Multi-stage Dockerfiles for both services, root `.dockerignore`, and a `render.yaml` Render Blueprint covering both services with full env var declarations.

**Files affected:**
- `apps/bot-api/Dockerfile` (new — builder: corepack + pnpm install + build + pnpm deploy; runner: Alpine + ffmpeg + prod bundle)
- `apps/worker/Dockerfile` (new — same pattern, no ffmpeg, no EXPOSE)
- `.dockerignore` (new — excludes node_modules, dist, .env files, .git, coverage, .supabase)
- `render.yaml` (new — Blueprint with `type: web` for bot-api and `type: worker` for worker; all env vars listed; secrets use `sync: false`)

**Key behavior:**
- `pnpm deploy --filter <pkg>` produces a standalone prod bundle (no devDeps; workspace packages with built dist/ copied into node_modules)
- App's own `dist/` copied separately with `cp -r` (not included by `pnpm deploy`)
- `corepack enable` activates the pnpm version declared in root `package.json`
- bot-api exposes port 3000 and declares `healthCheckPath: /health` in render.yaml
- Worker has no exposed port (Render `type: worker` background service)
- All env vars listed in render.yaml for both services; worker includes OPENAI_API_KEY and other unused vars because `parseEnv()` validates the full schema on startup

**Verification:** Dockerfiles and render.yaml reviewed and accepted.

---

## 2026-03-23 — Deploy Readiness + Telegram Webhook Registration (apps/bot-api)

**Task:** Add automatic Telegram webhook registration to bot-api startup and expose reusable webhook management helpers.

**Result:** bot-api now registers its webhook with Telegram on every startup before accepting traffic. If registration fails, the process exits with code 1 so Render does not mark the deploy healthy.

**Files affected:**
- `apps/bot-api/src/telegram/webhook-registration.ts` (new — `setWebhook`, `deleteWebhook`; both throw on all failure modes)
- `apps/bot-api/src/main.ts` (modified — calls `setWebhook` before `app.listen()` when `TELEGRAM_WEBHOOK_URL` is set)

**Key behavior:**
- `setWebhook`: registers URL + restricts to `['message', 'callback_query']` update types; passes `secret_token` when `TELEGRAM_WEBHOOK_SECRET` is configured; idempotent (safe on every restart)
- `deleteWebhook`: removes webhook (for local dev / polling mode switch); not called during normal production startup
- Registration skipped when `TELEGRAM_WEBHOOK_URL` is not set (local dev / polling mode) — warns in log
- Registration failure: logs error and exits 1 — Render health check fails, preventing traffic to a bot that cannot receive updates
- Unlike `telegram-client.ts` (swallows errors), these helpers throw — different contract for startup-time operations

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## 2026-03-23 — Subscription Access Gating Foundation (apps/bot-api)

**Task:** Implement central subscription access-control layer in bot-api, blocking expired/blocked/canceled users before any feature handler executes.

**Result:** All inbound Telegram updates (message, voice, callback_query) now pass through a subscription check immediately after user bootstrap. Blocked users receive a stub paywall message. No extra DB query — `current_plan_status` comes from the existing `bootstrapUser` upsert result.

**Files affected:**
- `apps/bot-api/src/telegram/access-control.ts` (new — `checkSubscriptionAccess(planStatus)`, `PAYWALL_MESSAGE`)
- `apps/bot-api/src/telegram/update-router.ts` (modified — access gate added after `bootstrapUser` in message, voice, and callback_query cases)

**Status decisions:**
- `trial`, `active`, `grace`, `pending` → allowed
- `expired`, `blocked`, `canceled` → blocked (paywall message sent)
- unknown/future values → blocked (conservative default)

**Key behavior:**
- No extra DB query: `current_plan_status` already returned by `bootstrapUser` upsert
- `checkSubscriptionAccess` is a pure function — no DB access, no side effects
- Paywall message is a Russian-language stub (no real payment link yet)
- callback_query case: access gate applied silently (no reply — handler not yet implemented)
- `break` after paywall — handler logic does not execute for blocked users

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## 2026-03-23 — Subscription Lifecycle Foundation (apps/worker)

**Task:** Implement deterministic subscription expiration to ensure trial and paid subscriptions do not remain active past their end dates.

**Result:** Worker now transitions eligible subscriptions to `'expired'` on every tick. The existing DB trigger keeps `users.current_plan_status` aligned automatically — no extra SQL needed.

**Files affected:**
- `apps/worker/src/subscriptions/lifecycle.ts` (new — `runSubscriptionLifecycleCheck`)
- `apps/worker/src/app.ts` (modified — `runSubscriptionLifecycleCheck` called first in tick, before scheduler)

**Key behavior:**
- Single `UPDATE public.subscriptions SET status = 'expired' WHERE is_current = true AND (trial expired OR paid expired)` covers both cases
- Existing trigger `trg_subscriptions_sync_user_plan` fires on each updated row and writes `users.current_plan_status = 'expired'` automatically
- Idempotent: already-expired rows don't match the WHERE clause, no double-update
- DB failure caught and logged; does not abort the rest of the tick
- Logs user_ids of all expired subscriptions when count > 0
- bot-api reads `current_plan_status` from DB on every `upsertUser` call, so access gating sees the worker-updated value within one poll interval

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/worker typecheck` ✓, `pnpm --filter @aqsha-ai/worker build` ✓

---

## 2026-03-23 — Admin Dashboard Bootstrap (apps/admin-web)

**Task:** Bootstrap the admin-web app as a minimal Next.js 15 + React 19 read-only dashboard showing live system stats.

**Result:** Fully functional internal dashboard with an overview page and a health endpoint. Build and typecheck pass. No auth yet (internal use only for this stage).

**Files affected:**
- `apps/admin-web/package.json` (replaced stub — Next.js 15.2.3, React 19, postgres 3.4.5; real scripts)
- `apps/admin-web/tsconfig.json` (new — standalone config; ESNext/Bundler/DOM; does not extend base)
- `apps/admin-web/next.config.ts` (new — minimal config; `output: 'standalone'` commented out pending Docker support)
- `apps/admin-web/src/lib/db.ts` (new — lazy `getDb()` postgres singleton; `prepare: false` for PgBouncer; global for dev hot-reload safety)
- `apps/admin-web/src/lib/queries.ts` (new — `getUserStats`, `getJobCounts`, `getRecommendationCounts`, `getRecentAdminEvents`, `getRecentFailedJobs`)
- `apps/admin-web/src/app/layout.tsx` (new — root layout with Aqsha AI Admin header)
- `apps/admin-web/src/app/globals.css` (new — minimal plain CSS; status tag colour helpers)
- `apps/admin-web/src/app/page.tsx` (new — Server Component, `force-dynamic`; overview cards + failed jobs + admin events tables)
- `apps/admin-web/src/app/api/health/route.ts` (new — `GET /api/health`; pings DB)
- `package.json` (root — added `pnpm.onlyBuiltDependencies: [esbuild, sharp]` to allow native build scripts)

**Key behavior:**
- `getDb()` is lazy — postgres connection not created at import time, safe for `next build` without `DATABASE_URL` present
- All pages use `export const dynamic = 'force-dynamic'` — always server-rendered, never cached
- Only env var required at runtime: `DATABASE_URL` (no Telegram/OpenAI keys needed)
- `tsconfig.json` is standalone (not extending `tsconfig.base.json`) — base uses CommonJS/Node, incompatible with Next.js App Router which requires ESNext/Bundler/DOM
- Dev port: 3001 (avoids conflict with bot-api on 3000)
- `output: 'standalone'` disabled for now — causes EPERM symlink errors on Windows; will be re-enabled when adding a Dockerfile for admin-web

**Dashboard content:**
- Users: total count + breakdown by `current_plan_status` with percentage
- Job queue: count by `status`
- Daily recommendations: count by `delivery_status`
- Recent failed jobs (last 10): id, type, attempts, error message, updated_at
- Recent admin events (last 20): event_type, actor_id, target_user_id, created_at

**Dependencies added:** `next@15.2.3`, `react@19.0.0`, `react-dom@19.0.0`, `postgres@3.4.5`, `@types/node`, `@types/react`, `@types/react-dom`, `typescript` (all scoped to admin-web)

**Verification:** `pnpm --filter @aqsha-ai/admin-web typecheck` ✓, `pnpm --filter @aqsha-ai/admin-web build` ✓

---

## 2026-03-23 — CI/CD Foundation (.github/workflows)

**Task:** Add GitHub Actions CI workflow to validate the monorepo on every push and PR.

**Result:** Single workflow file with two jobs — `build` (typecheck + build all packages and apps) and `docker` (Docker image validation). No automatic deployment.

**Files affected:**
- `.github/workflows/ci.yml` (new)

**Job: `build`** (`ubuntu-latest`, runs on all pushes and PRs targeting `main`/`dev`):
- Node.js 24, corepack, pnpm from `packageManager` field
- pnpm store cached by `pnpm-lock.yaml` hash
- `pnpm install --frozen-lockfile`
- Packages in order: `@aqsha-ai/shared build` → `@aqsha-ai/config build` → `@aqsha-ai/database build`
- Apps: `@aqsha-ai/bot-api typecheck + build`, `@aqsha-ai/worker typecheck + build`, `@aqsha-ai/admin-web typecheck + build`

**Job: `docker`** (`ubuntu-latest`, `needs: build`):
- `docker build -f apps/bot-api/Dockerfile -t aqsha-ai/bot-api:ci .`
- `docker build -f apps/worker/Dockerfile -t aqsha-ai/worker:ci .`
- Images not pushed to any registry

**Key behavior:**
- Any typecheck, build, or Docker build failure fails the workflow and blocks the PR
- `--frozen-lockfile` prevents lockfile drift from silently passing
- `--progress=plain` makes Docker layer output readable in CI logs
- No secrets required — build and typecheck need no env vars; Docker builds are self-contained

**Dependencies added:** none (workflow only uses standard GitHub Actions)

**Verification:** Workflow file reviewed. Local equivalent commands:
- `corepack enable && corepack install`
- `pnpm install --frozen-lockfile`
- `pnpm --filter @aqsha-ai/shared build`
- `pnpm --filter @aqsha-ai/config build`
- `pnpm --filter @aqsha-ai/database build`
- `pnpm --filter @aqsha-ai/bot-api typecheck && pnpm --filter @aqsha-ai/bot-api build`
- `pnpm --filter @aqsha-ai/worker typecheck && pnpm --filter @aqsha-ai/worker build`
- `pnpm --filter @aqsha-ai/admin-web typecheck && pnpm --filter @aqsha-ai/admin-web build`
- `docker build -f apps/bot-api/Dockerfile -t aqsha-ai/bot-api:ci .`
- `docker build -f apps/worker/Dockerfile -t aqsha-ai/worker:ci .`

---

## 2026-03-23 — Billing/Payment Stub Foundation (apps/bot-api)

**Task:** Add a deterministic billing/payment stub flow: billing entry commands, improved paywall message, and admin_events intent logging.

**Result:** Expired and blocked users can send billing commands ("оплатить", "подписка", "pay", etc.) and receive a clear stub response. Billing commands are checked before the access gate, so they work regardless of subscription status. Active/trial users pass through to normal flows unchanged. Each billing command logs a `billing_stub_intent` event to `admin_events`.

**Files affected:**
- `apps/bot-api/src/telegram/billing/billing-command-matcher.ts` (new — `matchBillingCommand(text)`, 6 exact-match tokens)
- `apps/bot-api/src/telegram/billing/billing-formatter.ts` (new — `BILLING_STUB_RESPONSE` constant)
- `apps/bot-api/src/telegram/billing/billing-service.ts` (new — `handleBillingCommand(userId, planStatus, db, logger)`; inserts `admin_events` row, returns stub response)
- `apps/bot-api/src/telegram/access-control.ts` (modified — `PAYWALL_MESSAGE` improved: now mentions "напишите «оплатить»")
- `apps/bot-api/src/telegram/update-router.ts` (modified — billing command check added in `message` case before access gate; two new imports)

**Routing order after this change (message case):**
1. `bootstrapUser` → userId, currentPlanStatus
2. `matchBillingCommand` → if matched: `handleBillingCommand` → send → break (all users)
3. `checkSubscriptionAccess` → if blocked: send `PAYWALL_MESSAGE` → break
4. `handleAnalyticsQuery` / `handleTextMessage` (allowed users only)

**Key behavior:**
- Billing commands accessible to ALL users including expired/blocked — checked before access gate
- `handleBillingCommand` inserts `(user_id, event_type='billing_stub_intent', event_source='bot', severity='info', event_payload={plan_status})` into `admin_events`
- admin_events insert failure is caught and logged non-fatally; stub response still returned
- Subscription status is never changed; no access is granted
- PAYWALL_MESSAGE now includes "Напишите «оплатить»…" to guide expired users

**Side-finding (fixed in subsequent task):** admin-web `getRecentAdminEvents` query referenced columns `actor_id`, `target_user_id`, `metadata` that do not exist in the actual `admin_events` schema. Fixed in "Admin-web admin_events Query Fix" entry below.

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/bot-api typecheck` ✓, `pnpm --filter @aqsha-ai/bot-api build` ✓

---

## 2026-03-23 — Admin-web admin_events Query Fix (apps/admin-web)

**Task:** Fix the `getRecentAdminEvents` query and `AdminEvent` interface in admin-web to match the real `public.admin_events` DB schema.

**Result:** Query and interface now reference only columns that exist. Admin events table on the dashboard renders correctly at runtime.

**Root cause:** When admin-web was bootstrapped, the `AdminEvent` interface and SELECT were written against a presumed schema (`actor_id`, `target_user_id`, `metadata`) that does not match the actual migration (`user_id`, `event_source`, `severity`, `event_payload`). The mismatch was caught as a side-finding during the billing stub implementation.

**Files affected:**
- `apps/admin-web/src/lib/queries.ts` (modified — `AdminEvent` interface corrected; SELECT rewritten to use real columns; `id::text` cast added for bigint)
- `apps/admin-web/src/app/page.tsx` (modified — admin events table headers changed from "Actor"/"Target user" to "Source"/"User"; cells now render `ev.event_source` and `ev.user_id`)

**Corrected interface:**
```typescript
interface AdminEvent {
  id: string;           // bigint cast to ::text in query
  event_type: string;
  user_id: string | null;
  event_source: string;
  severity: string;
  event_payload: Record<string, unknown>;
  created_at: string;
}
```

**Dependencies added:** none

**Verification:** `pnpm --filter @aqsha-ai/admin-web typecheck` ✓, `cd apps/admin-web && next build` ✓
