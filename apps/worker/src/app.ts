import pino from 'pino';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import { processJobs } from './job-queue/processor';
import { runSubscriptionLifecycleCheck } from './subscriptions/lifecycle';
import { runDailyRecommendationScheduler } from './daily-recommendations/scheduler';
import { runWeeklyReportScheduler } from './weekly-reports/scheduler';
import { runRecurringReminderScheduler } from './recurring-reminders/scheduler';
import { runGraceReminderScheduler } from './billing/grace-scheduler';
import { runTrialExpiryReminderScheduler } from './billing/trial-expiry-scheduler';
import { runGraceFinalReminderScheduler } from './billing/grace-final-scheduler';

export interface WorkerInstance {
  start(): void;
  stop(): Promise<void>;
}

/**
 * Creates the worker instance.
 *
 * The worker runs a periodic tick every JOB_POLL_INTERVAL_MS.
 * Concurrent ticks are prevented — if a tick is still running when
 * the next interval fires, the new tick is skipped and a warning is logged.
 *
 * Each tick claims and processes up to JOB_BATCH_SIZE jobs from public.job_queue.
 */
export function createWorker(env: AppEnv, db: DbPool): WorkerInstance {
  const logger = pino({ level: env.LOG_LEVEL, name: env.APP_NAME });

  let timer: ReturnType<typeof setInterval> | null = null;
  let tickInProgress = false;

  async function tick(): Promise<void> {
    if (tickInProgress) {
      logger.warn('Previous tick still running, skipping');
      return;
    }

    tickInProgress = true;
    try {
      logger.debug('Worker tick');
      await runSubscriptionLifecycleCheck(db, logger);
      await runDailyRecommendationScheduler(db, logger);
      await runWeeklyReportScheduler(db, logger);
      await runRecurringReminderScheduler(db, logger);
      await runGraceReminderScheduler(db, logger);
      await runTrialExpiryReminderScheduler(db, logger);
      await runGraceFinalReminderScheduler(db, logger);
      await processJobs(db, env, logger);
    } catch (err) {
      logger.error({ err }, 'Unhandled error in worker tick');
    } finally {
      tickInProgress = false;
    }
  }

  return {
    start() {
      logger.info({ pollIntervalMs: env.JOB_POLL_INTERVAL_MS }, 'Worker started');
      timer = setInterval(() => void tick(), env.JOB_POLL_INTERVAL_MS);
    },

    async stop(): Promise<void> {
      logger.info('Worker stopping');

      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }

      // Wait for any in-progress tick to finish before releasing the DB pool.
      if (tickInProgress) {
        logger.info('Waiting for current tick to complete');
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!tickInProgress) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });
      }

      logger.info('Worker stopped');
    },
  };
}
