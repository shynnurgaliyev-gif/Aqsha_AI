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
apps/admin-web/     — Internal admin dashboard
packages/config/    — Env schema + validation (@aqsha-ai/config)
packages/shared/    — Domain enums and types (@aqsha-ai/shared)
packages/database/  — DB connection layer (@aqsha-ai/database)
supabase/migrations/ — Schema source of truth (SQL only)
docs/               — Project memory (PROJECT_STATE, ARCHITECTURE_DECISIONS, IMPLEMENTATION_LOG)
```

---

## Domain Rules (non-negotiable)

These rules protect financial correctness and data integrity. Do not bypass them.

- **Money is stored as integer.** No float arithmetic anywhere in the stack.
- **Financial truth lives in DB + deterministic SQL.** LLM is for parsing and formatting only — never for computing balances, totals, or financial state.
- **DB schema changes via SQL migrations only.** File: `supabase/migrations/`. Never via ORM, Supabase dashboard, or ad-hoc SQL outside migration files.
- **No Supabase Auth for Telegram end users.** Users live in our own `users` table keyed by `telegram_user_id`.
- **No self-hosted LLM on Render.** All LLM calls use OpenAI API.
- **Voice actions with ambiguous intent must trigger confirmation** before any DB write.
- **`telegram_update_receipts` is written before processing any Telegram update** (idempotency guard).
- **Multi-step flows must use `user_sessions` table.** Do not rely on message text alone for state.

---

## Security Rules

- No secrets in the repository. `.env.example` contains variable names only.
- No hardcoded API keys, bot tokens, or DB passwords anywhere in code.
- Environment variables are the only secret delivery mechanism (via Render dashboard).

---

## Current State

All core features are implemented and deployed on Render. See `docs/PROJECT_STATE.md`
for the full completed-work table and next recommended steps.

**Remaining gaps:**
- Real billing / payment provider (currently `BILLING_PROVIDER=stub`)
- `apps/admin-web` Dockerfile + `render.yaml` entry
- Category-scoped analytics queries

---

## Project Memory

| File | Purpose |
|------|---------|
| `docs/PROJECT_STATE.md` | Current phase, completed work, next steps |
| `docs/ARCHITECTURE_DECISIONS.md` | ADR-style architectural decisions |
| `docs/IMPLEMENTATION_LOG.md` | Factual log of accepted completed work |
| `docs/DEPLOY_RUNBOOK.md` | Deployment procedure for Render |
| `docs/CLOSED_SMOKE_TEST.md` | Step-by-step smoke test checklist |

Read `PROJECT_STATE.md` before starting non-trivial work.
Update `PROJECT_STATE.md` and `IMPLEMENTATION_LOG.md` after every accepted task.
