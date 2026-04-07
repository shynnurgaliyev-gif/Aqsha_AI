# Deploy Runbook — Aqsha AI (Render)

> Authoritative deployment procedure for the first real production deploy.
> Update this file when deployment topology changes.

---

## Scope

Services deployed via this runbook:

| Service | Type | Dockerfile |
|---------|------|------------|
| `aqsha-ai-bot-api` | Render web service | `apps/bot-api/Dockerfile` |
| `aqsha-ai-worker` | Render background worker | `apps/worker/Dockerfile` |

**admin-web is not yet deployable** — it has no Dockerfile and is absent from `render.yaml`. Deploy bot-api and worker first. Admin-web will be added in a follow-up task.

---

## Prerequisites

Before starting:

- [ ] Supabase project created; migrations applied (see [Migrations](#3-apply-database-migrations))
- [ ] Telegram bot created via BotFather; `TELEGRAM_BOT_TOKEN` in hand
- [ ] OpenAI API key with access to `gpt-4.1-mini` and `gpt-4o-mini-transcribe`
- [ ] Render account with permission to create services
- [ ] GitHub repo connected to Render (or manual deploy access)

---

## Step 1 — Apply Database Migrations

Run both migrations against your Supabase project using the direct connection URL
(not the pooler — migrations require DDL which PgBouncer may reject):

```sh
# From repo root
DATABASE_URL=<SUPABASE_DIRECT_URL> \
  psql "$DATABASE_URL" -f supabase/migrations/20260322_001_init_schema.sql

DATABASE_URL=<SUPABASE_DIRECT_URL> \
  psql "$DATABASE_URL" -f supabase/migrations/20260324_002_add_monthly_budgets.sql
```

Verify the tables exist:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

Expected tables (minimum): `categories`, `jobs`, `monthly_budgets`, `subscriptions`,
`telegram_update_receipts`, `transactions`, `users`, `user_sessions`,
`admin_events`, `daily_recommendations`.

---

## Step 2 — Create Render Services

### Option A — Blueprint (recommended)

1. In the Render dashboard, choose **New → Blueprint**
2. Point to this repo; Render will detect `render.yaml`
3. Both `aqsha-ai-bot-api` and `aqsha-ai-worker` will be created
4. After creation, set all `sync: false` secrets (see [Secret Inventory](#secret-inventory))

### Option B — Manual

Create two services manually:

**bot-api:**
- Type: Web Service
- Environment: Docker
- Dockerfile path: `./apps/bot-api/Dockerfile`
- Docker context: `.` (repo root)
- Health check path: `/health`

**worker:**
- Type: Background Worker
- Environment: Docker
- Dockerfile path: `./apps/worker/Dockerfile`
- Docker context: `.` (repo root)

Set all env vars from the [Env Var Reference](#env-var-reference) table below.

---

## Secret Inventory

These must be set in the Render dashboard (marked `sync: false` in `render.yaml`).
They are **not** in the repo and must never be committed.

| Variable | Where used | Notes |
|----------|-----------|-------|
| `TELEGRAM_BOT_TOKEN` | bot-api, worker | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | bot-api, worker | Any random string; leave blank to skip validation |
| `TELEGRAM_WEBHOOK_URL` | bot-api, worker | Set **after** Step 3; see below |
| `DATABASE_URL` | bot-api, worker | Supabase **pooler** (PgBouncer) URL — transaction mode |
| `DATABASE_DIRECT_URL` | bot-api, worker | Supabase **direct** connection URL |
| `SUPABASE_URL` | bot-api, worker | Project URL from Supabase dashboard |
| `SUPABASE_ANON_KEY` | bot-api, worker | Anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | bot-api, worker | Service role key (keep secret) |
| `OPENAI_API_KEY` | bot-api, worker | Full API key |
| `APP_BASE_URL` | bot-api, worker | Render service URL, e.g. `https://aqsha-ai-bot-api.onrender.com` |

---

## Step 3 — First Deploy and Webhook Registration

1. Trigger the first deploy (Blueprint apply or manual deploy button)
2. Wait for both services to reach **Live** status
3. Note the bot-api public URL: `https://aqsha-ai-bot-api.onrender.com` (or your custom domain)
4. Set `APP_BASE_URL` and `TELEGRAM_WEBHOOK_URL` secrets on **both** services:
   - `APP_BASE_URL` = `https://aqsha-ai-bot-api.onrender.com`
   - `TELEGRAM_WEBHOOK_URL` = `https://aqsha-ai-bot-api.onrender.com/telegram/webhook`
5. Trigger a **manual redeploy** of bot-api — on startup it calls `setWebhook` automatically
6. Verify webhook registration in bot-api startup logs:
   ```
   Telegram webhook registered {"url":"https://aqsha-ai-bot-api.onrender.com/telegram/webhook"}
   ```
7. Alternatively, verify directly via Telegram API:
   ```sh
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```
   Response should show `url` set and `pending_update_count` at 0.

> **Note:** If `TELEGRAM_WEBHOOK_URL` is not set, bot-api will still start but webhook
> registration is skipped. The bot will not receive any messages.
>
> **Note:** If webhook registration fails, bot-api aborts startup. Check logs for the
> Telegram API error response.

---

## Step 4 — Verify Health

```sh
# bot-api health check
curl https://aqsha-ai-bot-api.onrender.com/health
# Expected: HTTP 200, {"status":"ok"} or similar JSON
```

Worker has no HTTP port. Verify via Render dashboard logs — look for:
```
Worker tick started
```
repeating on the configured `JOB_POLL_INTERVAL_MS` interval (default 5 s in production).

---

## Env Var Reference

Full reference for all variables. Defaults are declared in `render.yaml`; only
`sync: false` items need manual entry.

### Shared (both services)

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `production` | |
| `APP_TIMEZONE` | `Asia/Almaty` | Server timezone; user timezones are stored per-user in DB |
| `TELEGRAM_BOT_TOKEN` | — | Secret |
| `TELEGRAM_WEBHOOK_SECRET` | — | Secret; optional |
| `TELEGRAM_WEBHOOK_URL` | — | Secret; set after first deploy |
| `DATABASE_URL` | — | Secret; pooler URL |
| `DATABASE_DIRECT_URL` | — | Secret |
| `SUPABASE_URL` | — | Secret |
| `SUPABASE_ANON_KEY` | — | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Secret |
| `OPENAI_API_KEY` | — | Secret |
| `OPENAI_MODEL` | `gpt-4.1-mini` | |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg is baked into bot-api image |
| `MAX_VOICE_FILE_SIZE_MB` | `20` | |
| `JOB_POLL_INTERVAL_MS` | `5000` | |
| `JOB_BATCH_SIZE` | `10` | |
| `DAILY_RECOMMENDATION_DEFAULT_HOUR` | `9` | Local hour for scheduling recommendations |
| `ADMIN_ENABLED` | `false` | Admin HTTP endpoints; disabled in production by default |
| `ADMIN_PORT` | `4000` | |
| `LOG_LEVEL` | `info` | |
| `BILLING_PROVIDER` | `stub` | Replace with real provider when billing is implemented |
| `TRIAL_DAYS` | `7` | |
| `MONTHLY_PRICE_KZT` | `800` | |

### bot-api only

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_NAME` | `aqsha-ai-bot-api` | |
| `APP_PORT` | `3000` | Render injects `PORT` automatically; bot-api reads `APP_PORT` |
| `APP_BASE_URL` | — | Secret; Render service URL |

### worker only

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_NAME` | `aqsha-ai-worker` | |
| `APP_PORT` | `3000` | Unused at runtime; required by `parseEnv` schema |
| `APP_BASE_URL` | — | Secret; unused at runtime; required by `parseEnv` schema |

---

## Redeployment

Render auto-deploys on push to the connected branch (typically `main`).
For a manual redeploy: Render dashboard → service → **Manual Deploy**.

After any `render.yaml` change affecting env vars, set new secrets in the dashboard
and trigger a redeploy.

---

## Rollback

Render keeps deploy history per service. To roll back:
1. Dashboard → service → **Deploys** tab
2. Select the last known-good deploy → **Rollback to this deploy**

---

## Deferred

- admin-web: requires a Dockerfile and a new entry in `render.yaml`. See `docs/PROJECT_STATE.md` — Not Started section.
- Real billing: `BILLING_PROVIDER=stub` throughout. A real payment provider integration will replace the stub and may add new env vars.
