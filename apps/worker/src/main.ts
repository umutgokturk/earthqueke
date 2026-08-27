import { loadEnv } from '@ils/config';
import { loadDotEnv } from '@ils/config/dotenv';
import { createBus, createCache, createStore } from '@ils/database';
import pino from 'pino';
import { createIngestionEngine } from './engine';

/**
 * Standalone ingestion worker process. Requires a shared database
 * (DATABASE_URL) — without one, ingestion runs embedded inside the API
 * process instead, because the in-memory store cannot cross processes.
 */
async function main(): Promise<void> {
  loadDotEnv(); // repo-root .env (real environment variables win)
  const env = loadEnv();
  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });

  if (!env.DATABASE_URL) {
    logger.error(
      'DATABASE_URL is not set. The standalone worker needs a shared PostgreSQL database; ' +
        'in memory mode the API runs ingestion embedded (EMBEDDED_INGESTION). Exiting.',
    );
    process.exit(1);
  }
  if (env.embeddedIngestion) {
    logger.warn(
      'EMBEDDED_INGESTION is enabled — the API process runs ingestion. ' +
        'Running the standalone worker too would double-poll upstreams. Exiting.',
    );
    process.exit(0);
  }

  const store = createStore(env);
  const cache = createCache(env.REDIS_URL);
  const bus = createBus(env.REDIS_URL);
  const engine = createIngestionEngine({ env, store, bus, cache, logger });

  await engine.start();
  logger.info({ intervalMs: env.INGESTION_INTERVAL_MS, db: store.mode, bus: bus.mode }, 'worker.started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker.shutdown');
    await engine.stop();
    await bus.close();
    await cache.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
