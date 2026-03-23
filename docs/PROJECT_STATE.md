# Project State

> Persistent memory. Update only when a task result is accepted and verified.
> Do not invent completed work. Do not speculate.

---

## Current Branch

`dev` — all implementation work happens here. `main` is protected.

---

## Current Phase

**Deploy pipeline underway. Admin dashboard not yet started.**

The approved implementation order from CLAUDE.md:
1. ~~Lock architecture~~ ✓
2. ~~Lock repo structure~~ ✓
3. ~~Lock DB migration baseline~~ ✓
4. ~~Prepare implementation rules~~ ✓
5. ~~Start backend skeleton~~ ✓
6. ~~Telegram webhook / core flows~~ ✓
7. ~~Voice pipeline~~ ✓
8. ~~Analytics / recommendations~~ ✓ (analytics queries, job queue, recommendation generation, real Telegram delivery)
9. Admin dashboard — not yet started (skipped ahead)
10. → **Deploy pipeline** ← current (Docker packaging ✓, webhook registration ✓, CI/CD pending)

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

---

## Not Started

- Billing / subscription lifecycle logic
- Admin dashboard (apps/admin-web)
- CI/CD GitHub Actions

---

## Next Recommended Step

Implement CI/CD GitHub Actions pipeline:
- add `.github/workflows/` with a build + typecheck workflow triggered on push to `dev`
- optionally add a deploy-on-merge-to-main workflow that triggers Render deploy hooks

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
