import type { JobHandler } from '../types';

/**
 * Noop handler — completes immediately without side effects.
 * Useful for smoke-testing the job queue claiming pipeline end-to-end.
 */
export const noopHandler: JobHandler = async (job, ctx) => {
  ctx.logger.info({ jobId: job.id, attempts: job.attempts }, 'noop job executed');
};
