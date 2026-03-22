# CLAUDE.md

## Project Name
Aqsha_AI

## Project Type
AI-powered Telegram personal finance assistant.

## Product Goal
Build a production-ready Telegram bot for personal finance tracking.

The bot allows users to:
- record expenses and income
- assign categories
- ask for balance and analytics
- receive daily recommendations at 9:00 AM local time
- interact through text and voice inside Telegram

This is a paid product:
- 7-day free trial
- then 800 KZT/month
- payment is currently a stub, legal/payment integration will be added later

---

## Your Role
You are NOT the product owner.
You are NOT the system architect.
You are NOT allowed to redesign the stack.

You are the implementation engineer.
Your job is to implement tasks exactly within the approved architecture and rules.

When a task is unclear, do not invent a broader scope.
Work only inside the requested task boundaries.

---

## Core Architecture Decisions

### Hosting / Infra
- Deploy target: Render.com
- Database: Supabase Postgres
- Source control: GitHub
- Development environment: VS Code
- Deployment model: Docker-first
- The project must be deployable through Docker on Render

### AI Strategy
- Main LLM logic uses external API
- Do NOT self-host the main LLM on Render
- Voice input is included from day one
- Audio conversion is included from day one
- Financial truth must never depend on LLM output alone

### Data / Truth Model
- Financial truth lives only in database + application logic
- LLM is used only for:
  - parsing user input
  - understanding voice/text intent
  - formatting explanations
- Balance, reports, analytics, forecasts, limits, subscriptions must be computed by deterministic code/SQL

### Auth Model
- Do NOT use Supabase Auth for Telegram end users
- Telegram users are stored in our own `users` table
- Supabase Auth may be used later only for internal admin access

---

## Current Approved Database Scope

The current schema has already been created and must be treated as v1 baseline.

Main tables:
- users
- categories
- subscriptions
- user_sessions
- transactions
- daily_recommendations
- admin_events
- telegram_update_receipts
- job_queue

### Database Rules
- Database schema changes must go ONLY through SQL migrations
- Never make schema changes as ad-hoc dashboard-only decisions
- Source of truth for schema: `supabase/migrations/*.sql`
- Do not introduce ORM-driven schema ownership that replaces SQL migrations
- Do not delete existing tables/columns without explicit approval
- Do not change financial meaning of existing fields without explicit approval

### Money Rules
- Money amounts are stored as integer
- No float-based accounting logic
- No hidden recalculation rules
- Balance must be derived from transactions

---

## Repository Structure

```text
apps/
  bot-api/
  worker/
  admin-web/

packages/
  config/
  database/
  shared/

supabase/
  migrations/

docs/
.github/
  workflows/

Structure Rules
apps/bot-api = Telegram webhook/API service
apps/worker = async jobs / scheduled processing / queue consumers
apps/admin-web = internal admin dashboard
packages/database = db access layer, SQL helpers, shared DB code
packages/shared = shared types, constants, utils
packages/config = env/config schemas and shared config

Do not collapse everything into one folder.
Do not invent another repo structure unless explicitly requested.

Tech Direction

Preferred stack:

TypeScript
Node.js
pnpm workspace
Docker
PostgreSQL / Supabase
Important
Do not introduce Prisma unless explicitly approved
Prefer SQL-first / migration-first approach
Keep dependencies minimal
Avoid unnecessary frameworks and abstractions
Write production-oriented code, not tutorial-style code
Telegram Bot Rules
Input Modes

Supported from the beginning:

text input
voice input
Voice Handling Rules
Voice messages must be transcribed
Audio conversion support is required
Voice-based financial actions must not be silently committed when meaning is ambiguous
Confirmation flow is required for uncertain parses
Session Rules
Multi-step flows must use user_sessions
Do not rely only on last message text
Session context should be explicit and controlled
Telegram Update Handling
Updates must be idempotent
Use telegram_update_receipts for deduplication / audit
Do not process the same Telegram update twice
Background Jobs Rules

Use worker / queue approach for async flows.

Examples:

daily recommendations generation
recommendation delivery
retries after failure
voice/audio-heavy processing
long-running AI tasks

Do not run heavy fan-out work synchronously inside webhook request handlers.

Render / Docker Rules
Project is Docker-first
Deployment target is Render
Do not assume native runtime-only deployment
Dockerfiles must be production-oriented
Environment variables must be used for secrets
No secrets in repository
No hardcoded API keys or tokens
Security Rules

Never commit:

Telegram bot token
Supabase service role key
OpenAI API key
database passwords
.env with secrets

Use:

.env.example for variable names only
Render environment variables for real secrets
Working Mode

For non-trivial tasks, always start with a short implementation plan before changing files.

Expected workflow:

read current relevant files
understand the exact task
propose a short implementation plan
implement only the requested scope
verify result
summarize changed files and what was done

Do not make broad unrelated refactors.

Task Execution Rules

When implementing a task:

change only files relevant to the task
do not introduce unrelated improvements
do not rename files/modules without reason
do not expand scope silently
do not rewrite working architecture because of preference

If something conflicts with this file, follow this file.

Code Quality Rules

Code must be:

readable
typed
explicit
production-oriented
easy to review

Prefer:

small modules
clear naming
isolated responsibilities
predictable behavior
simple error handling

Avoid:

magic behavior
over-abstraction
premature optimization
giant files without structure
Definition of Done

A task is done only if:

requested scope is implemented
architecture rules are respected
no unrelated files were changed
code builds logically
types and imports are coherent
migration logic is safe when relevant
output is reviewable and understandable
Forbidden Without Explicit Approval

Do NOT do any of the following unless explicitly asked:

switch database
switch hosting provider
replace Docker strategy
replace Render deployment strategy
add Supabase Auth for Telegram users
self-host the main LLM on Render
introduce Prisma
redesign the repository structure
rewrite schema manually outside migrations
merge unfinished work into main
remove session handling
store money as float
Branching / Git Rules
Work should happen in dev unless explicitly told otherwise
main is protected production-oriented branch
Do not assume direct merge to main
Keep commits scoped and understandable
Current Priority

Current project phase:

lock architecture
lock repo structure
lock DB migration baseline
prepare implementation rules for development agent
then start backend skeleton
then Telegram webhook/core flows
then voice pipeline
then analytics / recommendations
then admin dashboard
then deploy pipeline

Do not jump ahead and build everything at once.

Response Format Expected From You

For meaningful implementation tasks, respond in this structure:

Brief plan
Files to change
Implementation
Verification summary
Risks / assumptions

Keep it focused.
Do not provide endless optional improvements unless explicitly asked.

Final Instruction

This project must be built as a controlled engineering system.
You are an executor inside an approved architecture.
Stay inside scope.
Protect consistency.
Prefer correctness over creativity.