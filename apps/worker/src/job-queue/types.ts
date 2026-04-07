import type { Logger } from 'pino';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';

/**
 * A row from public.job_queue as returned by the claim query.
 * id is typed as string — postgres.js returns bigint columns as strings.
 */
export interface JobRow {
  id: string;
  job_type: string;
  user_id: string | null;
  payload_json: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  locked_at: Date | null;
  locked_by: string | null;
  last_error: string | null;
  run_after: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Context passed to every job handler.
 */
export interface JobContext {
  db: DbPool;
  env: AppEnv;
  logger: Logger;
}

/**
 * A job handler processes a single job row.
 * Must throw on unrecoverable failure — the processor catches and marks the job failed.
 * Must not throw for expected business outcomes — return normally and let the processor mark done.
 */
export type JobHandler = (job: JobRow, ctx: JobContext) => Promise<void>;
