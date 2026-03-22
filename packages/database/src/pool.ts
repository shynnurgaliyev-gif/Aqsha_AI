import postgres, { type Sql } from 'postgres';

/**
 * A configured postgres.js instance (connection pool).
 * Use this type for dependency injection in repositories.
 */
export type DbPool = Sql;

export interface DbPoolOptions {
  /** Maximum number of connections in the pool. Default: 10 */
  maxConnections?: number;
  /** Seconds before an idle connection is closed. Default: 30 */
  idleTimeoutSeconds?: number;
  /** Seconds to wait when establishing a new connection. Default: 30 */
  connectTimeoutSeconds?: number;
}

/**
 * Creates a PostgreSQL connection pool.
 *
 * Pass DATABASE_URL for regular queries (goes through Supabase pooler).
 * Pass DATABASE_DIRECT_URL for migrations and DDL (direct connection).
 *
 * IMPORTANT: `prepare: false` is required for Supabase's PgBouncer pooler
 * running in transaction mode. Prepared statements are not supported there.
 *
 * Call this once at application startup, not per-request.
 */
export function createDbPool(connectionString: string, options: DbPoolOptions = {}): DbPool {
  const {
    maxConnections = 10,
    idleTimeoutSeconds = 30,
    connectTimeoutSeconds = 30,
  } = options;

  return postgres(connectionString, {
    max: maxConnections,
    idle_timeout: idleTimeoutSeconds,
    connect_timeout: connectTimeoutSeconds,
    // Required for Supabase PgBouncer in transaction mode.
    // Without this, the pool will fail on prepared statement commands.
    prepare: false,
  });
}

/**
 * Gracefully closes all connections in the pool.
 * Call this during application shutdown.
 */
export async function closeDbPool(pool: DbPool): Promise<void> {
  await pool.end();
}
