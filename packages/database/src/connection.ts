import type { AppEnv } from '@aqsha-ai/config';
import { createDbPool, type DbPool, type DbPoolOptions } from './pool';

/**
 * pooled  — goes through Supabase PgBouncer. Use for normal app queries.
 * direct  — bypasses the pooler. Use for migrations and DDL.
 */
export type DatabaseConnectionMode = 'pooled' | 'direct';

/**
 * Returns the appropriate connection string from the validated app env.
 *
 *   pooled → DATABASE_URL       (PgBouncer / Supabase pooler)
 *   direct → DATABASE_DIRECT_URL (raw Postgres, bypasses pooler)
 */
export function getDatabaseConnectionString(
  env: Pick<AppEnv, 'DATABASE_URL' | 'DATABASE_DIRECT_URL'>,
  mode: DatabaseConnectionMode = 'pooled',
): string {
  return mode === 'direct' ? env.DATABASE_DIRECT_URL : env.DATABASE_URL;
}

/**
 * Creates a database pool directly from the validated app env.
 * Convenience wrapper over createDbPool — callers do not need to
 * manually pick a connection string.
 *
 * @param env     - parsed AppEnv (from parseEnv())
 * @param mode    - 'pooled' (default) or 'direct'
 * @param options - optional pool tuning
 */
export function createDbPoolFromEnv(
  env: Pick<AppEnv, 'DATABASE_URL' | 'DATABASE_DIRECT_URL'>,
  mode: DatabaseConnectionMode = 'pooled',
  options?: DbPoolOptions,
): DbPool {
  const connectionString = getDatabaseConnectionString(env, mode);
  return createDbPool(connectionString, options);
}
