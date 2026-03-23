import type { JobHandler } from './types';
import { noopHandler } from './handlers/noop';
import { dailyRecommendationGenerateHandler } from '../daily-recommendations/handlers/generate';
import { dailyRecommendationDeliverHandler } from '../daily-recommendations/handlers/deliver';
import { dailyRecommendationDeliverStubHandler } from '../daily-recommendations/handlers/deliver-stub';

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
]);

/**
 * Returns the handler for the given job_type, or null if the type is unknown.
 */
export function getHandler(jobType: string): JobHandler | null {
  return handlers.get(jobType) ?? null;
}
