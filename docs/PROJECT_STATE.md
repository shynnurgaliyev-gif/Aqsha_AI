# Project State

> Persistent memory. Update only when a task result is accepted and verified.
> Do not invent completed work. Do not speculate.

---

## Current Branch

`dev` — all implementation work happens here. `main` is protected.

---

## Current Phase

**LLM analytics parsing foundation done. Real billing integration and admin-web Dockerfile remain.**

The approved implementation order from CLAUDE.md:
1. ~~Lock architecture~~ ✓
2. ~~Lock repo structure~~ ✓
3. ~~Lock DB migration baseline~~ ✓
4. ~~Prepare implementation rules~~ ✓
5. ~~Start backend skeleton~~ ✓
6. ~~Telegram webhook / core flows~~ ✓
7. ~~Voice pipeline~~ ✓
8. ~~Analytics / recommendations~~ ✓ (analytics queries, job queue, recommendation generation, real Telegram delivery)
9. ~~Admin dashboard~~ ✓ (Next.js 15 bootstrap with overview stats page)
10. ~~Deploy pipeline~~ ✓ (Docker packaging ✓, webhook registration ✓, subscription gating ✓, lifecycle ✓, CI ✓)

---

## Completed Work

| Item | Status | Notes |
|------|--------|-------|
| Monorepo skeleton | ✓ accepted | pnpm workspace, tsconfig.base.json, apps/, packages/ |
| DB schema v1 migration | ✓ accepted | `supabase/migrations/20260322_001_init_schema.sql` |
| `@aqsha-ai/config` | ✓ accepted | zod env schema, `parseEnv`, `AppEnv` |
| `@aqsha-ai/shared` | ✓ accepted | 10 domain enums + readonly arrays |
| `@aqsha-ai/database` | ✓ accepted | postgres.js pool, `createDbPool`, `createDbPoolFromEnv` |
| `apps/bot-api` skeleton | ✓ accepted | Fastify v5, `/health`, bootstrap, graceful shutdown |
| `apps/worker` skeleton | ✓ accepted | pino, poll loop, tick guard, graceful shutdown |
| Telegram webhook foundation | ✓ accepted | `POST /telegram/webhook`, secret validation, dedup via `telegram_update_receipts`, placeholder dispatcher |
| Telegram routing + user bootstrap | ✓ accepted | update router, user upsert, session ensure, trial subscription ensure |
| Text transaction intake foundation | ✓ accepted | narrow parser, category resolver, draft/confirm flow via `user_sessions`, transaction insert on confirm |
| Telegram outbound sending foundation | ✓ accepted | `telegram-client.ts`, fetch-based `sendMessage`, wired into text intake flow |
| Voice intake pipeline | ✓ accepted | `file-fetcher.ts`, `audio-converter.ts`, `transcriber.ts`, `handler.ts`; size guard, ffmpeg stdin→stdout, Whisper, feeds transcript into `handleTextMessage` |
| Analytics query foundation | ✓ accepted | `telegram/analytics/`: query-matcher (13 tokens), analytics-repository (4 SQL queries), formatter, handler; balance, month totals, category breakdown, recent transactions; wired into update-router before text intake |
| Worker job queue foundation | ✓ accepted | `job-queue/`: types, repository (claim/done/failed), registry, processor, noop handler; `FOR UPDATE SKIP LOCKED` claiming; wired into worker tick |
| Daily recommendation foundation | ✓ accepted | `daily-recommendations/`: repository (stats, idempotent insert, delivery enqueue), calculator (days remaining, safe daily spend), formatter, generate handler, deliver-stub handler; both handlers registered in job registry |
| Real Telegram delivery from worker | ✓ accepted | `worker/src/telegram/sender.ts` (throwing sender); deliver handler; `markRecommendationSent`, `markRecommendationFailed`, `findUserForDelivery` in repository; job type `daily_recommendation_deliver` registered |
| Daily recommendation scheduling foundation | ✓ accepted | `daily-recommendations/scheduler.ts`: single-SQL eligible user scan with dual dedup (daily_recommendations row + pending job); wired into worker tick before `processJobs` |
| Docker / Render production packaging | ✓ accepted | multi-stage Dockerfiles for bot-api (with ffmpeg) and worker; `.dockerignore`; `render.yaml` blueprint with both services and all env vars |
| Deploy readiness + Telegram webhook registration | ✓ accepted | `telegram/webhook-registration.ts` (`setWebhook`, `deleteWebhook`); bot-api now auto-registers webhook on startup when `TELEGRAM_WEBHOOK_URL` is set; aborts startup on registration failure |
| Subscription access gating | ✓ accepted | `telegram/access-control.ts` (`checkSubscriptionAccess`, `PAYWALL_MESSAGE`); gating wired into `update-router.ts` after `bootstrapUser` for message, voice, callback_query; no extra DB query; stub paywall message for expired/blocked/canceled users |
| Subscription lifecycle foundation | ✓ accepted | `worker/src/subscriptions/lifecycle.ts` (`runSubscriptionLifecycleCheck`); single UPDATE expires trial+active subscriptions past their end date; DB trigger keeps `users.current_plan_status` aligned; wired into worker tick before scheduler |
| Admin dashboard bootstrap | ✓ accepted | Next.js 15 + React 19 app in `apps/admin-web`; overview page with user/job/recommendation stats and recent admin events + failed jobs; `GET /api/health`; lazy postgres singleton; `force-dynamic` rendering; typecheck ✓, build ✓ |
| CI/CD foundation | ✓ accepted | `.github/workflows/ci.yml`; two jobs: `build` (typecheck + build all packages and apps) and `docker` (Docker image validation for bot-api and worker); pnpm store cached; triggers on all pushes and PRs to main/dev |
| Billing/payment stub foundation | ✓ accepted | `telegram/billing/`: `billing-command-matcher.ts`, `billing-formatter.ts`, `billing-service.ts`; billing commands ("оплатить", "подписка", "pay", …) checked before access gate; `admin_events` row on intent; improved paywall message; typecheck ✓, build ✓ |
| Admin-web admin_events query fix | ✓ accepted | `queries.ts`: `AdminEvent` interface + SELECT corrected to real columns (`user_id`, `event_source`, `severity`, `event_payload`); `page.tsx`: table headers/cells updated; typecheck ✓, build ✓ |
| Transaction correction foundation | ✓ accepted | `telegram/transaction-correction/`: matcher, repository, session, formatter, handler; show-recent + delete-last commands; pending-delete state in `context_json['pendingDelete']`; soft-delete via `is_deleted`/`deleted_at`/`parse_status='deleted'`; mutual exclusion with pendingTransaction; typecheck ✓, build ✓ |
| Soft-delete parse_status alignment | ✓ accepted | `softDeleteTransaction` now also sets `parse_status = 'deleted'`; post-delete state: `is_deleted=true`, `deleted_at=<ts>`, `parse_status='deleted'`; typecheck ✓, build ✓ |
| Transaction correction expansion (amount + category) | ✓ accepted | `correction-amount-matcher.ts`, `correction-category-matcher.ts`, `correction-edit-session.ts` (new); `correction-repository.ts` + `correction-formatter.ts` + `correction-handler.ts` + `correction-session.ts` (modified); `context_json['pendingCorrection']`; mutual exclusion with pendingDelete + pendingTransaction; parse_status set to 'corrected'; typecheck ✓, build ✓ |
| Monthly budget / category limit foundation | ✓ accepted | `supabase/migrations/20260324_002_add_monthly_budgets.sql`; `telegram/budgets/`: command-matcher, repository, formatter, handler; set/show/list commands; `monthly_budgets` table with unique constraint per user/category/month; DB trigger enforces expense-only; `update-router.ts` wired between analytics and correction; typecheck ✓, build ✓ |
| Budget-aware daily recommendation expansion | ✓ accepted | `worker/src/daily-recommendations/repository.ts`: `BudgetStatusRow`, `loadUserBudgetStatuses` (current-month budgets with spending from confirmed+corrected transactions); `calculator.ts`: `BudgetSignal`, `BudgetSignalKind`, `selectBudgetSignals` (on_track/near_limit/over_budget at 80% threshold); `formatter.ts`: `budgetSignals` field on `RecommendationParams`, warning lines appended for near_limit+over_budget categories; `handlers/generate.ts`: loads budgets, computes signals, extends `payload_json.budgets`, passes signals to formatter; typecheck ✓, build ✓ |
| Admin-web internal access protection | ✓ accepted | `src/middleware.ts`: HTTP Basic Auth gate; `ADMIN_SECRET` env var required; missing secret → 503; wrong/absent credentials → 401 + `WWW-Authenticate: Basic`; `/api/health` excluded via matcher (open for Render health checks); `_next/*` excluded; `.env.example` updated with `ADMIN_SECRET=`; typecheck ✓, build ✓ |
| LLM transaction parsing foundation | ✓ accepted | `text-intake/ai-parser.ts` (new): OpenAI Chat Completions fallback; `response_format: json_object`, `temperature: 0`, `max_tokens: 150`; strict result validator (kind, positive-integer amount, non-empty category); `handler.ts`: two-stage parse (deterministic first → AI fallback); `env: AppEnv` param added; `voice-intake/handler.ts` + `update-router.ts` updated to pass `env`; no schema changes; typecheck ✓, build ✓ |
| LLM analytics parsing foundation | ✓ accepted | `analytics/ai-query-parser.ts` (new): OpenAI Chat Completions fallback; extracts `{query_type, period, kind, category}`; strict validator + `mapToQueryType` maps to existing `AnalyticsQueryType` or null (unsupported period/category filter/ambiguous kind → safe null); `handler.ts`: two-stage flow (deterministic first → AI fallback), `env: AppEnv` param added; `update-router.ts` updated to pass `env`; all calculations remain deterministic SQL; no schema changes; typecheck ✓, build ✓ |

---

## Not Started

- Real billing / payment provider integration (replace stub with actual payment flow)
- Admin dashboard: Dockerfile + render.yaml entry for admin-web service

---

## Next Recommended Step

Add a budget-alert worker job: proactively notify users when a category crosses 80% or 100% of its monthly limit (signals already computed in the daily recommendation flow).

Or extend analytics query layer to support category-scoped queries (e.g. "how much did I spend on food this month") — AI parser already extracts the category candidate, but `mapToQueryType` returns null until the SQL layer supports it.

Or implement real billing / payment provider integration (replace stub with actual invoice/payment flow).

Or add Dockerfile + render.yaml entry for admin-web (ADR-001 requires Docker deployment for all services).

---

## Important Guardrails

- Money stored as integer. No float arithmetic.
- DB schema changes via SQL migrations only. Never via ORM or dashboard.
- Financial truth lives in DB + app logic. LLM is for parsing and formatting only.
- Do not use Supabase Auth for Telegram end users.
- Do not self-host the main LLM on Render.
- Do not introduce Prisma.
- `telegram_update_receipts` must be written before processing any update.
- Multi-step flows must use `user_sessions` table.
- Voice actions with ambiguous parse must trigger confirmation flow.
