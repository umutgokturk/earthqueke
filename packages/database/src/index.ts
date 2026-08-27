import type { AppEnv } from '@ils/config';
import { createPool } from './pool';
import { MemoryStore } from './memory-store';
import { PgStore } from './pg-store';
import type { DataStore } from './store';

export * from './store';
export * from './shared';
export * from './cache';
export * from './bus';
export * from './synthetic';
export { MemoryStore } from './memory-store';
export { PgStore } from './pg-store';
export { createPool } from './pool';
export { runMigrations } from './migrate';
export { runSeed } from './seed';

/** Create the right DataStore for the environment (PostGIS or in-memory). */
export function createStore(env: Pick<AppEnv, 'DATABASE_URL'>): DataStore {
  if (env.DATABASE_URL) {
    return new PgStore(createPool(env.DATABASE_URL));
  }
  return new MemoryStore();
}
