import { loadEnv } from '@ils/config';
import { loadDotEnv } from '@ils/config/dotenv';
import { createBus, createCache, createStore } from '@ils/database';
import { createIngestionEngine, type IngestionEngine } from '@ils/worker';
import pino from 'pino';
import { buildServer } from './server';

async function main(): Promise<void> {
  loadDotEnv(); // repo-root .env (real environment variables win)
  const env = loadEnv();
  const store = createStore(env);
  const cache = createCache(env.REDIS_URL);
  const bus = createBus(env.REDIS_URL);

  await store.init();

  // Memory mode cannot share the store across processes, so ingestion runs
  // embedded here; with Postgres it runs embedded only when EMBEDDED_INGESTION
  // is set — otherwise the standalone worker (apps/worker) owns it.
  let engine: IngestionEngine | null = null;
  if (env.embeddedIngestion) {
    const engineLogger = pino({ level: env.LOG_LEVEL, base: { service: 'worker(embedded)' } });
    engine = createIngestionEngine({ env, store, bus, cache, logger: engineLogger });
  }

  const { app } = await buildServer({ env, store, cache, bus, engine });
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(
    {
      port: env.API_PORT,
      db: store.mode,
      cache: cache.mode,
      bus: bus.mode,
      embeddedIngestion: Boolean(engine),
      environment: env.NODE_ENV,
    },
    'api.started',
  );

  if (engine) {
    await engine.start();
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'api.shutdown');
    if (engine) await engine.stop();
    await app.close();
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
