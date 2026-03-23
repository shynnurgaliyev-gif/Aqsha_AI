import type { JobHandler } from './types';
import { noopHandler } from './handlers/noop';

/**
 * Registry of known job type handlers.
 * Add new handlers here as job types are implemented.
 */
const handlers = new Map<string, JobHandler>([
  ['noop', noopHandler],
]);

/**
 * Returns the handler for the given job_type, or null if the type is unknown.
 */
export function getHandler(jobType: string): JobHandler | null {
  return handlers.get(jobType) ?? null;
}
