# Architecture Decisions

> Short ADR-style records for approved architectural decisions.
> Status: accepted = final for this project. Do not reverse without explicit approval.

---

## ADR-001 — Docker-First Deployment on Render

**Status:** Accepted

**Decision:** All services (bot-api, worker, admin-web) are deployed as Docker containers on Render.com.

**Reason:** Render supports Docker natively. Docker-first ensures environment parity between local and production, avoids native runtime lock-in, and is required for reproducible deployments.

**Rejected:** Native Node.js runtime-only deployment on Render (no Dockerfile). Rejected because it reduces portability and makes environment reproducibility harder.

---

## ADR-002 — Supabase Postgres as Main Database

**Status:** Accepted

**Decision:** PostgreSQL hosted on Supabase is the sole persistent data store. Connection via Supabase PgBouncer pooler URL (`DATABASE_URL`) for app queries, direct URL (`DATABASE_DIRECT_URL`) for migrations and DDL.

**Reason:** Supabase provides managed Postgres with a generous free tier, connection pooling, and Supabase Studio for inspection. No separate database infrastructure needed.

**Rejected:** Self-hosted Postgres on Render, MongoDB, other hosted databases.

---

## ADR-003 — No Supabase Auth for Telegram End Users

**Status:** Accepted

**Decision:** Telegram end users are stored in the project's own `users` table keyed by `telegram_user_id`. Supabase Auth is not used for user identity.

**Reason:** Supabase Auth is designed for browser/OAuth flows. Telegram users authenticate implicitly via their Telegram identity. Adding Supabase Auth would create unnecessary complexity and a mismatched auth model.

**Rejected:** Supabase Auth for Telegram users. May be revisited for internal admin access only.

---

## ADR-004 — LLM via External API, Not Self-Hosted

**Status:** Accepted

**Decision:** All LLM calls use the OpenAI API (configured via `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`). No LLM is self-hosted on Render.

**Reason:** Self-hosting an LLM on Render requires GPU instances, high cost, and operational complexity that is out of scope for this product stage.

**Rejected:** Self-hosted open-source LLM on Render (e.g. Llama via Ollama).

---

## ADR-005 — Financial Truth in DB / App Logic, Not in LLM

**Status:** Accepted

**Decision:** Balance, transaction history, reports, analytics, forecasts, limits, and subscription state are always computed by deterministic SQL queries or application logic. The LLM is used only for: parsing user input, understanding intent, transcribing voice, and formatting explanations.

**Reason:** LLMs are non-deterministic and cannot be trusted as a source of financial truth. Any LLM-computed financial value could silently hallucinate. Financial correctness requires deterministic code.

**Rejected:** Using LLM to compute or recalculate balances or summaries.

---

## ADR-006 — Monorepo with pnpm Workspaces

**Status:** Accepted

**Decision:** Single Git repository with pnpm workspaces. Structure: `apps/` for deployable services, `packages/` for shared internal libraries.

```
apps/bot-api      — Telegram webhook / HTTP service
apps/worker       — Background job processor
apps/admin-web    — Internal admin dashboard
packages/config   — Env validation (@aqsha-ai/config)
packages/shared   — Domain enums and types (@aqsha-ai/shared)
packages/database — DB connection layer (@aqsha-ai/database)
```

**Reason:** Monorepo keeps shared code, types, and tooling aligned. pnpm workspaces avoid duplicate installs and enable workspace: protocol for local deps.

**Rejected:** Separate repositories per service. Polyrepo would fragment shared types and create sync overhead.

---

## ADR-007 — SQL Migrations as Schema Source of Truth

**Status:** Accepted

**Decision:** All database schema changes go through SQL migration files in `supabase/migrations/`. No ORM-driven schema ownership. No schema changes via Supabase dashboard alone.

**Reason:** SQL migrations are explicit, reviewable, version-controlled, and reproducible. ORM-driven migrations (e.g. Prisma) take ownership of schema and conflict with a SQL-first approach.

**Rejected:** Prisma migrations, Supabase dashboard-only schema changes, ad-hoc SQL without migration files.

---

## ADR-008 — Voice Input Supported From Day One

**Status:** Accepted

**Decision:** Voice messages are supported as a first-class input mode from the initial Telegram integration. Audio conversion (ffmpeg) and transcription (OpenAI Whisper) are part of the core pipeline.

**Reason:** Voice is a primary input mode for mobile users in the target market. Retrofitting voice later would require rearchitecting the input handling pipeline.

**Rejected:** Text-only MVP with voice added later.

**Constraints:**
- Voice actions with ambiguous intent must trigger a confirmation flow before committing.
- Voice messages must be transcribed before any business logic runs.

---

## ADR-009 — Money Stored as Integer (Minor Unit)

**Status:** Accepted

**Decision:** All monetary amounts in the `transactions` table are stored as integers (e.g. tenge, not fractional). No float-based accounting logic anywhere.

**Reason:** Float arithmetic is unsuitable for financial calculations due to rounding errors. Integer storage is exact, simple, and standard.

**Rejected:** Storing money as `numeric`/`decimal` with float math in application code.
