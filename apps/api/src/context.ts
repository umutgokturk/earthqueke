import type { AppEnv } from '@ils/config';
import type { CacheLayer, DataStore, EventBus } from '@ils/database';
import type { IngestionEngine } from '@ils/worker';

export interface ApiContext {
  env: AppEnv;
  store: DataStore;
  cache: CacheLayer;
  bus: EventBus;
  /** Present when ingestion runs embedded in this process. */
  engine: IngestionEngine | null;
  startedAt: number;
  version: string;
  wsClientCount: () => number;
}

/** Public endpoints exclude synthetic (seed/mock) data in production. */
export function publicOpts(env: AppEnv): { includeSynthetic: boolean } {
  return { includeSynthetic: !env.isProduction };
}
