import type { JobHandler } from './types';
import { noopHandler } from './handlers/noop';
import { dailyRecommendationGenerateHandler } from '../daily-recommendations/handlers/generate';
import { dailyRecommendationDeliverHandler } from '../daily-recommendations/handlers/deliver';
import { dailyRecommendationDeliverStubHandler } from '../daily-recommendations/handlers/deliver-stub';
import { weeklyReportGenerateHandler } from '../weekly-reports/handlers/generate';
import { weeklyReportDeliverHandler } from '../weekly-reports/handlers/deliver';
import { graceReminderSendHandler } from '../billing/grace-reminder-handler';
import { trialExpiryReminderHandler } from '../billing/trial-expiry-handler';
import { graceFinalReminderHandler } from '../billing/grace-final-handler';

/**
 * Registry of known job type handlers.
 * Add new handlers here as job types are implemented.
 */
const handlers = new Map<string, JobHandler>([
  ['noop', noopHandler],
  ['daily_recommendation_generate', dailyRecommendationGenerateHandler],
  ['daily_recommendation_deliver', dailyRecommendationDeliverHandler],
  // deliver-stub kept for backward compat with any previously queued stub jobs
  ['daily_recommendation_deliver_stub', dailyRecommendationDeliverStubHandler],
  ['weekly_report_generate', weeklyReportGenerateHandler],
  ['weekly_report_deliver', weeklyReportDeliverHandler],
  ['grace_reminder_send', graceReminderSendHandler],
  ['trial_expiry_reminder', trialExpiryReminderHandler],
  ['grace_final_reminder', graceFinalReminderHandler],
]);

/**
 * Returns the handler for the given job_type, or null if the type is unknown.
 */
export function getHandler(jobType: string): JobHandler | null {
  return handlers.get(jobType) ?? null;
}
