# Project State

> Persistent memory. Update only when a task result is accepted and verified.
> Do not invent completed work. Do not speculate.

---

## Current Branch

`dev` — all implementation work happens here. `main` is protected.

---

## Current Phase

**Voice pipeline complete. Analytics / recommendations is next.**

The approved implementation order from CLAUDE.md:
1. ~~Lock architecture~~ ✓
2. ~~Lock repo structure~~ ✓
3. ~~Lock DB migration baseline~~ ✓
4. ~~Prepare implementation rules~~ ✓
5. ~~Start backend skeleton~~ ✓
6. ~~Telegram webhook / core flows~~ ✓
7. ~~Voice pipeline~~ ✓
8. → **Analytics / recommendations** ← current
9. Admin dashboard
10. Deploy pipeline

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

---

## Not Started

- Job queue processors (job_queue table)
- Daily recommendations generation and delivery
- Billing / subscription lifecycle logic
- Admin dashboard (apps/admin-web)
- Docker configuration
- Render deployment pipeline
- CI/CD GitHub Actions

---

## Next Recommended Step

Implement analytics query foundation in `apps/bot-api`:
- `GET /balance` equivalent as a bot command: deterministic SQL sum of income - expenses for a user
- spending by category: aggregate transactions grouped by category for current month
- transaction history: recent N transactions for a user
- all queries must be deterministic SQL — no LLM involvement (per ADR-005)
- wire results into bot replies via existing `sendMessage`

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
