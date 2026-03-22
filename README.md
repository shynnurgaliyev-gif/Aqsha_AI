# Aqsha_AI

AI-powered Telegram personal finance assistant.

## Overview

Aqsha_AI is a production-oriented Telegram bot for personal finance tracking.

The bot allows users to:
- record expenses
- record income
- assign categories
- request balance and analytics
- receive daily recommendations at 9:00 AM local time
- interact through text and voice inside Telegram

This is a paid product:
- 7-day free trial
- then 800 KZT/month
- payment flow is currently stubbed

## Core Product Principles

- financial truth lives in database and application logic
- LLM is used only for parsing and response formatting
- balance and analytics must be deterministic
- Telegram is the main user interface
- voice input is supported from day one
- deployment is Docker-first
- hosting target is Render.com
- database is Supabase Postgres

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

Main Services
apps/bot-api

Main backend service:

Telegram webhook
command handling
transaction creation flows
analytics requests
voice input entry point
apps/worker

Background processing:

job queue processing
daily recommendations
retries
async AI tasks
heavy voice/audio tasks
apps/admin-web

Internal admin dashboard:

logs
users
subscriptions
product analytics
Database

Database is hosted in Supabase Postgres.

Schema changes must go through:

SQL migrations
stored in supabase/migrations/

Do not treat Supabase dashboard edits as source of truth.

Environment Variables

Environment variables are documented in:

.env.example

Real secrets must never be committed to the repository.

Current Project Phase

Current phase:

lock architecture
lock repository structure
lock database migration baseline
prepare Claude operating rules
start backend skeleton
implement Telegram core flows
implement voice pipeline
implement analytics and daily recommendations
implement admin dashboard
prepare deployment pipeline
Development Rules
work in dev branch
keep changes scoped
do not redesign architecture without approval
do not store secrets in git
do not change DB schema outside migrations
do not use float for money
do not use Supabase Auth for Telegram users
Tech Direction

Preferred stack:

Node.js
TypeScript
pnpm workspace
Docker
Supabase Postgres
Render.com
Status

Initial project scaffolding is prepared.
Database baseline is defined and stored as migration.
Next step is backend application skeleton.