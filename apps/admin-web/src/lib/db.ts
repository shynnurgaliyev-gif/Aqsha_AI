import postgres from 'postgres';

// Global singleton to survive Next.js dev hot-reloads.
// In production each process gets one connection pool.
declare global {
  // eslint-disable-next-line no-var
  var _adminDb: ReturnType<typeof postgres> | undefined;
}

function createDb(): ReturnType<typeof postgres> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  return postgres(url, {
    // PgBouncer transaction mode: disable prepared statements
    prepare: false,
    // Small pool — admin dashboard has low concurrency
    max: 3,
  });
}

/**
 * Returns the shared postgres connection, creating it on first call.
 * Lazy so that Next.js can import this module at build time without
 * requiring DATABASE_URL to be present in the build environment.
 */
export function getDb(): ReturnType<typeof postgres> {
  if (process.env['NODE_ENV'] === 'production') {
    // In production each process gets one pool — no hot-reload risk.
    if (!globalThis._adminDb) {
      globalThis._adminDb = createDb();
    }
    return globalThis._adminDb;
  }

  // In dev, store on global to survive hot-reloads.
  if (!globalThis._adminDb) {
    globalThis._adminDb = createDb();
  }
  return globalThis._adminDb;
}
