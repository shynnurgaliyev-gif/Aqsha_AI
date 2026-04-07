# Closed Smoke Test — Aqsha AI

> Step-by-step checklist for the first production-like smoke test after deploy.
> Run this against a real deployed environment (not localhost) before opening to users.
> Uses a single test Telegram account throughout.

---

## Environment

| Item | Value |
|------|-------|
| Bot URL | `https://aqsha-ai-bot-api.onrender.com` |
| Telegram account | Personal / dedicated test account |
| Test currency | KZT |

---

## 0 — Infrastructure Health

- [ ] `GET https://aqsha-ai-bot-api.onrender.com/health` → HTTP 200
- [ ] Worker logs show recurring `Worker tick started` (every ~5 s)
- [ ] `getWebhookInfo` returns correct URL and `pending_update_count: 0`

  ```sh
  curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
  ```

---

## 1 — New User Bootstrap

Send `/start` to the bot.

- [ ] Bot replies with a welcome message
- [ ] `users` table: a new row with the test account's `telegram_id`
- [ ] `subscriptions` table: a trial subscription row with `plan_status = 'trial'` and `ends_at` set to ~7 days from now
- [ ] `user_sessions` table: a session row for the user

---

## 2 — Text Transaction Intake (Expense)

Send: `кофе 500`

- [ ] Bot replies asking to confirm (shows amount + category)
- [ ] Reply `да` (or `yes`)
- [ ] Bot confirms the transaction
- [ ] `transactions` table: new row with `kind='expense'`, `amount=500`, `parse_status='confirmed'`, `is_deleted=false`

---

## 3 — Text Transaction Intake (Income)

Send: `зарплата 200000`

- [ ] Bot replies asking to confirm (shows amount + category)
- [ ] Reply `да`
- [ ] Bot confirms
- [ ] `transactions` table: new row with `kind='income'`, `amount=200000`, `parse_status='confirmed'`

---

## 4 — LLM Transaction Fallback

Send a phrase that does not match deterministic patterns, e.g.: `потратил пятьсот тенге на такси`

- [ ] Bot replies asking to confirm (OpenAI parsed amount + category)
- [ ] Reply `да`
- [ ] Transaction inserted correctly

If OPENAI_API_KEY is invalid, bot should still not crash — it will fall through to the
unknown-message branch. Verify bot-api logs show the OpenAI error rather than a 500.

---

## 5 — Voice Transaction Intake

Send a voice message saying an expense (e.g., "пятьсот тенге продукты").

- [ ] Bot processes the voice message (may take a few seconds)
- [ ] Bot replies with confirmation prompt showing parsed amount + category
- [ ] Reply `да`
- [ ] Transaction inserted correctly
- [ ] `transactions` table: row with `parse_source='voice'` or equivalent

---

## 6 — Transaction Correction — Delete

Send: `удали последнюю`

- [ ] Bot shows the most recent transaction and asks to confirm deletion
- [ ] Reply `да`
- [ ] Bot confirms deletion
- [ ] `transactions` table: that row has `is_deleted=true`, `parse_status='deleted'`

---

## 7 — Transaction Correction — Edit Amount

Add a fresh transaction first (e.g., `такси 1200`, confirm).

Send: `измени сумму последней на 1500`

- [ ] Bot shows the transaction with new amount and asks to confirm
- [ ] Reply `да`
- [ ] `transactions` table: `amount=1500`, `parse_status='corrected'`

---

## 8 — Transaction Correction — Edit Category

Send: `измени категорию последней`

- [ ] Bot prompts to choose or type a new category
- [ ] Send a category name (e.g., `транспорт`)
- [ ] Bot confirms
- [ ] `transactions` table: `category_id` updated, `parse_status='corrected'`

---

## 9 — Analytics — Balance

Send: `баланс`

- [ ] Bot replies with current balance (income minus expenses, all time)
- [ ] Verify the number matches manual SQL:
  ```sql
  SELECT
    SUM(CASE WHEN kind='income' THEN amount ELSE 0 END)
    - SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END) AS balance
  FROM transactions
  WHERE user_id = '<id>' AND is_deleted = false AND parse_status IN ('confirmed','corrected');
  ```

---

## 10 — Analytics — Period Totals

Send each and verify the number is non-negative and plausible:

- [ ] `расходы сегодня` → expense total for today
- [ ] `доходы за месяц` → income total for current month
- [ ] `расходы за прошлый месяц` → expense total for previous month
- [ ] `расходы эта неделя` → expense total for current ISO week (Mon–Sun)

---

## 11 — Analytics — Category Breakdown

Send: `расходы по категориям`

- [ ] Bot replies with a per-category breakdown (up to 10 rows, sorted by total)
- [ ] Categories and amounts match `transactions` for the current month

---

## 12 — Recent Transactions

Send: `последние транзакции`

- [ ] Bot replies with the 5 most recent confirmed non-deleted transactions
- [ ] Each row shows kind, amount, category, and date

---

## 13 — Monthly Budget — Set and Show

Send: `установи бюджет еда 30000`

- [ ] Bot confirms budget set
- [ ] `monthly_budgets` table: row for the current month with `category_id` for "еда", `limit_amount=30000`

Send: `бюджет`

- [ ] Bot shows the budget list with limit and spent amounts

---

## 14 — Daily Recommendation (Manual Trigger)

Insert a `daily_recommendation_generate` job directly in the DB for the test user:

```sql
INSERT INTO jobs (job_type, payload_json, status)
VALUES ('daily_recommendation_generate', '{"userId":"<uuid>"}', 'pending');
```

- [ ] Worker picks up and processes the job within one poll interval (≤5 s)
- [ ] `daily_recommendations` table: new row for today
- [ ] A `daily_recommendation_deliver` job is enqueued
- [ ] Worker processes the deliver job
- [ ] Test user receives a Telegram message with a daily recommendation
- [ ] `daily_recommendations` row: `sent_at` populated

---

## 15 — Subscription Expiry / Paywall

Manually expire the test subscription:

```sql
UPDATE subscriptions
SET ends_at = NOW() - INTERVAL '1 minute', plan_status = 'expired'
WHERE user_id = '<uuid>';

-- Also update the denormalized column:
UPDATE users SET current_plan_status = 'expired' WHERE id = '<uuid>';
```

Send: `баланс`

- [ ] Bot replies with the paywall message (not the balance)
- [ ] Bot does NOT crash or return a 500

Send a billing command to verify it bypasses the paywall: `подписка`

- [ ] Bot replies with billing/subscription info (not the paywall message)
- [ ] `admin_events` table: a row recording the billing intent

Restore the subscription for further tests:
```sql
UPDATE subscriptions
SET ends_at = NOW() + INTERVAL '7 days', plan_status = 'trial'
WHERE user_id = '<uuid>';
UPDATE users SET current_plan_status = 'trial' WHERE id = '<uuid>';
```

---

## 16 — Worker Lifecycle (Subscription Expiry Job)

Manually expire a subscription in the future (test the automated path):

```sql
UPDATE subscriptions
SET ends_at = NOW() - INTERVAL '1 second'
WHERE user_id = '<uuid>' AND plan_status = 'trial';
```

Wait one worker cycle (≤5 s).

- [ ] `subscriptions.plan_status` updated to `'expired'` by the lifecycle check
- [ ] `users.current_plan_status` updated to `'expired'` by the DB trigger

---

## Pass Criteria

All checkboxes above are checked.
No HTTP 500 responses in bot-api logs.
No unhandled exceptions in worker logs.
All DB state assertions hold.

---

## Known Gaps (not smoke-tested here)

- Real payment flow: billing is a stub (`BILLING_PROVIDER=stub`); no actual charge occurs
- Admin dashboard: no Dockerfile yet; cannot be smoke-tested via Render
- Category-scoped analytics queries: AI parser extracts category but no SQL path exists yet
