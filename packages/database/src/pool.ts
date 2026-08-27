import pg from 'pg';

export type PgPool = pg.Pool;

export function createPool(databaseUrl: string): PgPool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => {
    // Keep the process alive on transient connection errors; queries surface their own failures.
    console.error(JSON.stringify({ level: 'ERROR', service: 'database', event: 'pool_error', message: err.message }));
  });
  return pool;
}
