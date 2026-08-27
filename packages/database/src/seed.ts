import path from 'node:path';
import { createPool } from './pool';
import { PgStore } from './pg-store';
import { generateSyntheticHistory } from './synthetic';

/**
 * Seed CLI.
 *  - Always (any environment): idempotently seeds fault segments, regions and
 *    the data-source registry (via PgStore.init()).
 *  - development/test only: optionally inserts a clearly-labelled synthetic
 *    history (dataClass 'seed', source 'MOCK') so charts and tables have data.
 *    Refuses to write synthetic events when NODE_ENV=production.
 */
export async function runSeed(
  databaseUrl: string,
  opts: { withHistory?: boolean; days?: number; force?: boolean; nodeEnv?: string } = {},
  log: (msg: string) => void = console.log,
): Promise<void> {
  const pool = createPool(databaseUrl);
  const store = new PgStore(pool);
  await store.init();
  log('Registry seeded: fault segments, regions, data sources.');

  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const withHistory = opts.withHistory ?? nodeEnv !== 'production';
  if (!withHistory) {
    log('Skipping synthetic history.');
    await pool.end();
    return;
  }
  if (nodeEnv === 'production') {
    log('NODE_ENV=production — synthetic history is never seeded in production. Done.');
    await pool.end();
    return;
  }

  const existing = await store.queryEarthquakes({ limit: 1 }, { includeSynthetic: true });
  if (existing.total > 0 && !opts.force) {
    log(`Database already contains ${existing.total} events — skipping synthetic history (use --force to add anyway).`);
    await pool.end();
    return;
  }

  const reports = generateSyntheticHistory({ days: opts.days ?? 30, dataClass: 'seed', idPrefix: 'seed' });
  log(`Inserting ${reports.length} synthetic events (dataClass=seed, source=MOCK)…`);
  let inserted = 0;
  for (const report of reports) {
    await store.insertEvent(report);
    inserted += 1;
    if (inserted % 200 === 0) log(`  ${inserted}/${reports.length}`);
  }
  log(`Done: ${inserted} synthetic seed events inserted (clearly labelled, excluded in production).`);
  await pool.end();
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set — the in-memory dev store seeds itself at API startup.');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  const noHistory = process.argv.includes('--no-history');
  runSeed(url, { force, withHistory: noHistory ? false : undefined })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    });
}
