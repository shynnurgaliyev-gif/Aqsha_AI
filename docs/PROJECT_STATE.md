# Project State

> Persistent memory. Update only when a task result is accepted and verified.
> Do not invent completed work. Do not speculate.

---

## Current Branch

`dev` — all implementation work happens here. `main` is protected.

---

## Current Phase

**Telegram webhook / core flows — in progress.**

The approved implementation order from CLAUDE.md:
1. ~~Lock architecture~~ ✓
2. ~~Lock repo structure~~ ✓
3. ~~Lock DB migration baseline~~ ✓
4. ~~Prepare implementation rules~~ ✓
5. ~~Start backend skeleton~~ ✓
6. → **Telegram webhook / core flows** ← current
7. Voice pipeline
8. Analytics / recommendations
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

---

## Not Started

- Telegram update routing (text, voice, callback_query handlers)
- User bootstrap / upsert on first seen
- User session management
- Transaction parsing (text and voice)
- Voice transcription pipeline (ffmpeg + OpenAI Whisper)
- Job queue processors (job_queue table)
- Daily recommendations generation and delivery
- Billing / subscription lifecycle logic
- Admin dashboard (apps/admin-web)
- Docker configuration
- Render deployment pipeline
- CI/CD GitHub Actions

---

## Next Recommended Step

Implement Telegram update routing and user bootstrap in `apps/bot-api`:
- upsert user row in `users` table on first seen (by `telegram_user_id`)
- route updates by type inside `handleTelegramUpdate` (message, voice, callback_query)
- add stub handlers per update type
- do not implement transaction parsing yet — routing and user upsert only

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
