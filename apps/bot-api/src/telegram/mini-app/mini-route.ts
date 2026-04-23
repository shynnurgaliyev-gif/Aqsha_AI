import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { verifyTelegramInitData } from './mini-auth';
import { createMiniSession, getMiniSessionUserId } from './mini-session';
import { queryBalance, queryPeriodTotal, queryCategoryBreakdownByPeriod, queryRecentTransactions } from '../analytics/analytics-repository';
import { getUserTimezone } from '../analytics/analytics-repository';
import { resolvePeriodRange, type DateRange } from '../analytics/period-resolver';
import { listRecurringExpenses } from '../recurring/recurring-repository';
import { listGoals } from '../goals/goal-repository';
import { getCurrentSubscriptionInfo } from '../../billing/billing-repository';

/** Helper: extract X-Mini-Auth token and resolve userId or return 401 */
async function requireMiniAuth(
  db: DbPool,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const raw = req.headers['x-mini-auth'];
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const userId = await getMiniSessionUserId(db, token);
  if (!userId) {
    await reply.status(401).send({ ok: false, error: 'Unauthorized' });
    return null;
  }
  return userId;
}

export function createMiniAppRoute(env: AppEnv, db: DbPool) {
  return async function plugin(fastify: FastifyInstance): Promise<void> {
    // ── CORS — Mini App is served from a different origin ────────────────────
    fastify.addHook('onSend', async (_req, reply) => {
      const origin = env.TELEGRAM_MINIAPP_URL
        ? new URL(env.TELEGRAM_MINIAPP_URL).origin
        : '*';
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Mini-Auth');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    });

    fastify.options('/telegram/mini/*', async (_req, reply) => reply.send());

    // ── POST /telegram/mini/auth ─────────────────────────────────────────────
    fastify.post<{ Body: { init_data: string } }>(
      '/telegram/mini/auth',
      async (req, reply) => {
        const { init_data } = req.body ?? {};
        if (!init_data) {
          return reply.status(400).send({ ok: false, error: 'init_data required' });
        }

        const verified = verifyTelegramInitData(init_data, env.TELEGRAM_BOT_TOKEN);
        if (!verified) {
          return reply.status(401).send({ ok: false, error: 'Invalid init data' });
        }

        const rows = await db<{ id: string; current_plan_status: string; first_name: string | null }[]>`
          SELECT id::text, current_plan_status, first_name
            FROM public.users
           WHERE telegram_user_id = ${verified.user.id}
             AND is_active = true
        `;

        if (!rows[0]) {
          // User has never written to the bot
          return reply.send({ ok: true, state: 'not_registered' });
        }

        const user = rows[0];
        const token = await createMiniSession(db, user.id);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        return reply.send({
          ok: true,
          state: 'authenticated',
          plan_status: user.current_plan_status,
          first_name: user.first_name ?? verified.user.first_name,
          mini_token: token,
          expires_at: expiresAt,
        });
      },
    );

    // ── GET /telegram/mini/data ──────────────────────────────────────────────
    // Returns all data needed to render the Mini App in one request.
    fastify.get('/telegram/mini/data', async (req, reply) => {
      const userId = await requireMiniAuth(db, req, reply);
      if (!userId) return;

      const timezone = await getUserTimezone(db, userId);
      const monthRange = resolvePeriodRange('current_month', timezone);
      const prevMonthRange = resolvePeriodRange('previous_month', timezone);

      const [
        balance,
        monthExpense,
        monthIncome,
        prevMonthExpense,
        categories,
        transactions,
        recurring,
        goals,
        subscription,
      ] = await Promise.all([
        queryBalance(db, userId),
        queryPeriodTotal(db, userId, 'expense', monthRange),
        queryPeriodTotal(db, userId, 'income', monthRange),
        queryPeriodTotal(db, userId, 'expense', prevMonthRange),
        queryCategoryBreakdownByPeriod(db, userId, 'expense', monthRange),
        queryRecentTransactions(db, userId),
        listRecurringExpenses(db, userId),
        listGoals(db, userId),
        getCurrentSubscriptionInfo(db, userId),
      ]);

      return reply.send({
        ok: true,
        balance,
        month: {
          expense: monthExpense,
          income: monthIncome,
          prevExpense: prevMonthExpense,
          range: monthRange,
        },
        categories,
        transactions: transactions.map((t, i) => ({
          id: String(i),
          kind: t.kind,
          amount: t.amount,
          categoryName: t.categoryName,
          rawText: null,
          date: t.transactionDateLocal,
        })),
        recurring,
        goals,
        subscription: subscription
          ? {
              status: subscription.status,
              endDate: subscription.endDate.toISOString(),
              daysLeft: Math.max(0, Math.ceil((subscription.endDate.getTime() - Date.now()) / 86400000)),
            }
          : null,
      });
    });

    // ── GET /telegram/mini/transactions ──────────────────────────────────────
    // Transaction list filtered by date range (?from=YYYY-MM-DD&to=YYYY-MM-DD).
    // Defaults to current calendar month when params are omitted.
    fastify.get<{ Querystring: { from?: string; to?: string } }>(
      '/telegram/mini/transactions',
      async (req, reply) => {
      const userId = await requireMiniAuth(db, req, reply);
      if (!userId) return;

      const timezone = await getUserTimezone(db, userId);
      const monthRange = resolvePeriodRange('current_month', timezone);

      const from = req.query.from ?? monthRange.gte;
      const to   = req.query.to   ?? new Date().toISOString().slice(0, 10);

      const rows = await db<{
        id: string;
        kind: string;
        amount: string;
        category_name: string;
        raw_text: string | null;
        transaction_date_local: string;
      }[]>`
        SELECT
          t.id::text,
          t.kind,
          t.amount,
          c.name AS category_name,
          t.source_raw_text AS raw_text,
          t.transaction_date_local::text
        FROM public.transactions t
        JOIN public.categories c ON c.id = t.category_id
        WHERE t.user_id = ${userId}
          AND t.is_deleted = false
          AND t.parse_status IN ('confirmed', 'corrected')
          AND t.transaction_date_local >= ${from}::date
          AND t.transaction_date_local <= ${to}::date
        ORDER BY t.transaction_at DESC
        LIMIT 500
      `;

      return reply.send({
        ok: true,
        transactions: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          amount: Number(r.amount),
          categoryName: r.category_name,
          rawText: r.raw_text,
          date: r.transaction_date_local,
        })),
      });
    });

    // ── GET /telegram/mini/analytics ─────────────────────────────────────────
    // Analytics for a specific month: ?month=YYYY-MM  (defaults to current).
    fastify.get<{ Querystring: { month?: string } }>(
      '/telegram/mini/analytics',
      async (req, reply) => {
        const userId = await requireMiniAuth(db, req, reply);
        if (!userId) return;

        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const month = req.query.month ?? defaultMonth;

        if (!/^\d{4}-\d{2}$/.test(month)) {
          return reply.status(400).send({ ok: false, error: 'Invalid month format, use YYYY-MM' });
        }

        const [yearStr, monStr] = month.split('-');
        const year = Number(yearStr);
        const mon  = Number(monStr); // 1-based

        // Current month range  [YYYY-MM-01, next month 01)
        const rangeGte  = `${year}-${String(mon).padStart(2, '0')}-01`;
        const nextD     = new Date(year, mon, 1); // Date month is 0-based → mon = next month
        const rangeLt   = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-01`;
        const range: DateRange = { gte: rangeGte, lt: rangeLt };

        // Previous month range
        const prevD    = new Date(year, mon - 2, 1); // mon-2 because month is 1-based
        const prevGte  = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}-01`;
        const prevRange: DateRange = { gte: prevGte, lt: rangeGte };

        const [expense, income, prevExpense, categories] = await Promise.all([
          queryPeriodTotal(db, userId, 'expense', range),
          queryPeriodTotal(db, userId, 'income', range),
          queryPeriodTotal(db, userId, 'expense', prevRange),
          queryCategoryBreakdownByPeriod(db, userId, 'expense', range),
        ]);

        return reply.send({
          ok: true,
          month: { expense, income, prevExpense, range, label: month },
          categories,
        });
      },
    );
  };
}
