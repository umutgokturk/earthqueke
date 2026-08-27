import type { AppEnv } from '@ils/config';
import type { CacheLayer, DataStore, EventBus } from '@ils/database';
import { generateSyntheticHistory } from '@ils/database';
import { computeActivity } from '@ils/gis';
import type { ActivitySnapshot, SourceId } from '@ils/types';
import { findMatch, type DedupeConfig } from './dedupe';
import { AfadProvider } from './providers/afad.provider';
import { KandilliProvider } from './providers/kandilli.provider';
import { MockProvider } from './providers/mock.provider';
import type { EarthquakeProvider } from './providers/types';
import { validateReport } from './validate';

export interface EngineLogger {
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
  debug(obj: Record<string, unknown> | string, msg?: string): void;
}

export interface CycleSummary {
  source: SourceId;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR' | 'SKIPPED';
  fetched: number;
  inserted: number;
  updated: number;
  merged: number;
  invalid: number;
  latencyMs: number | null;
  error?: string;
}

export interface IngestionEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  runCycle(sourceFilter?: string): Promise<CycleSummary[]>;
  isRunning(): boolean;
  providers(): EarthquakeProvider[];
}

export interface EngineDeps {
  env: AppEnv;
  store: DataStore;
  bus: EventBus;
  cache?: CacheLayer;
  logger: EngineLogger;
}

const CACHE_PREFIX = 'eq:';
const ACTIVITY_REGIONS: Array<{ slug: string; storeRegion: string | undefined }> = [
  { slug: 'all', storeRegion: undefined },
  { slug: 'istanbul', storeRegion: 'istanbul' },
  { slug: 'marmara', storeRegion: 'marmara' },
];
const ACTIVITY_SAVE_INTERVAL_MS = 5 * 60_000;
const OFFLINE_AFTER_ERRORS = 3;

export function buildProviders(env: AppEnv): EarthquakeProvider[] {
  const opts = {
    bbox: {
      minLat: env.INGEST_MIN_LAT,
      maxLat: env.INGEST_MAX_LAT,
      minLon: env.INGEST_MIN_LON,
      maxLon: env.INGEST_MAX_LON,
    },
    windowMs: 6 * 3_600_000,
    timeoutMs: 12_000,
  };
  const providers: EarthquakeProvider[] = [
    new AfadProvider(env.AFAD_API_URL, opts),
    new KandilliProvider(env.KANDILLI_API_URL, opts),
  ];
  if (env.mockProviderEnabled) {
    providers.push(new MockProvider(env.NODE_ENV));
  }
  return providers;
}

export function createIngestionEngine(deps: EngineDeps, providerOverride?: EarthquakeProvider[]): IngestionEngine {
  const { env, store, bus, cache, logger } = deps;
  const providers = providerOverride ?? buildProviders(env);
  const dedupeCfg: DedupeConfig = {
    timeSeconds: env.DEDUPE_TIME_SECONDS,
    distanceKm: env.DEDUPE_DISTANCE_KM,
    magnitudeDelta: env.DEDUPE_MAGNITUDE_DELTA,
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let running = false;
  let stopped = false;
  const activityState = new Map<string, { lastSavedAt: number; lastScore: number }>();

  async function processProvider(provider: EarthquakeProvider): Promise<CycleSummary> {
    const summary: CycleSummary = {
      source: provider.id,
      status: 'SUCCESS',
      fetched: 0,
      inserted: 0,
      updated: 0,
      merged: 0,
      invalid: 0,
      latencyMs: null,
    };

    const sources = await store.listSources();
    const registry = sources.find((s) => s.id === provider.id);
    if (registry && !registry.enabled) {
      summary.status = 'SKIPPED';
      await store.patchSource(provider.id, { status: 'DISABLED' });
      return summary;
    }

    const runId = await store.startRun(provider.id);
    const t0 = Date.now();
    try {
      const reports = await provider.getLatestEarthquakes();
      summary.latencyMs = Date.now() - t0;
      summary.fetched = reports.length;

      for (const raw of reports) {
        const validation = validateReport(raw);
        if (!validation.ok) {
          summary.invalid += 1;
          logger.debug({ source: provider.id, error: validation.error }, 'ingestion.invalid_report');
          continue;
        }
        const report = validation.report;
        const sourceEventId = report.sourceEventId ?? report.id;

        const existing = await store.getBySourceEvent(report.source, sourceEventId);
        if (existing) {
          const { event, changed } = await store.mergeReport(existing.id, report);
          if (changed) {
            summary.updated += 1;
            await bus.publish({ type: 'earthquake:updated', data: event });
          }
          continue;
        }

        const candidates = await store.getCandidates({
          occurredAt: report.occurredAt,
          toleranceSeconds: dedupeCfg.timeSeconds,
          latitude: report.latitude,
          longitude: report.longitude,
          radiusKm: dedupeCfg.distanceKm,
        });
        const match = findMatch(report, candidates, dedupeCfg);
        if (match) {
          const { event } = await store.mergeReport(match.id, report);
          summary.merged += 1;
          await bus.publish({ type: 'earthquake:updated', data: event });
          logger.info(
            { source: provider.id, eventId: event.id, sources: event.sources.map((s) => s.source) },
            'ingestion.merged_duplicate',
          );
          continue;
        }

        const event = await store.insertEvent(report);
        summary.inserted += 1;
        await bus.publish({ type: 'earthquake:new', data: event });
        logger.info(
          { source: provider.id, eventId: event.id, magnitude: event.magnitude, location: event.location },
          'ingestion.new_event',
        );
      }

      await store.finishRun(runId, {
        status: summary.invalid > 0 && summary.invalid === summary.fetched ? 'PARTIAL' : 'SUCCESS',
        fetched: summary.fetched,
        inserted: summary.inserted,
        updated: summary.updated,
        merged: summary.merged,
        invalid: summary.invalid,
      });
      await store.patchSource(provider.id, {
        status: 'ONLINE',
        lastSuccessAt: new Date().toISOString(),
        latencyMs: summary.latencyMs,
        errorCount: 0,
        lastError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.status = 'ERROR';
      summary.error = message;
      summary.latencyMs = Date.now() - t0;
      await store.finishRun(runId, { status: 'ERROR', error: message, fetched: summary.fetched });
      const current = (await store.listSources()).find((s) => s.id === provider.id);
      const errorCount = (current?.errorCount ?? 0) + 1;
      await store.patchSource(provider.id, {
        status: errorCount >= OFFLINE_AFTER_ERRORS ? 'OFFLINE' : 'DEGRADED',
        lastErrorAt: new Date().toISOString(),
        lastError: message,
        errorCount,
        latencyMs: summary.latencyMs,
      });
      await store.logEvent({
        level: 'ERROR',
        service: 'worker',
        event: 'ingestion.provider_error',
        message: `${provider.id}: ${message}`,
        context: { source: provider.id, errorCount },
      });
      logger.warn({ source: provider.id, error: message, errorCount }, 'ingestion.provider_error');
    }
    return summary;
  }

  async function computeAndPublishActivity(): Promise<void> {
    const snapshots: ActivitySnapshot[] = [];
    for (const region of ACTIVITY_REGIONS) {
      const events = await store.eventsForActivity(region.storeRegion, {
        includeSynthetic: !env.isProduction,
      });
      const snapshot = computeActivity({ events, region: region.slug });
      snapshots.push(snapshot);
      const state = activityState.get(region.slug);
      const now = Date.now();
      if (
        !state ||
        now - state.lastSavedAt >= ACTIVITY_SAVE_INTERVAL_MS ||
        Math.abs(snapshot.score - state.lastScore) >= 1
      ) {
        await store.saveActivity(snapshot);
        activityState.set(region.slug, { lastSavedAt: now, lastScore: snapshot.score });
      }
    }
    await bus.publish({ type: 'activity:update', data: snapshots });
  }

  async function runCycle(sourceFilter?: string): Promise<CycleSummary[]> {
    if (running) return [];
    running = true;
    const summaries: CycleSummary[] = [];
    try {
      for (const provider of providers) {
        if (sourceFilter && provider.id !== sourceFilter) continue;
        summaries.push(await processProvider(provider));
      }
      const changedData = summaries.some((s) => s.inserted + s.updated + s.merged > 0);
      if (changedData && cache) {
        await cache.del(CACHE_PREFIX);
      }
      await computeAndPublishActivity();
      await bus.publish({ type: 'sources:status', data: await store.listSources() });
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'ingestion.cycle_error');
    } finally {
      running = false;
    }
    return summaries;
  }

  async function seedMemoryDevHistory(): Promise<void> {
    if (store.mode !== 'memory' || env.isProduction) return;
    const existing = await store.queryEarthquakes({ limit: 1 }, { includeSynthetic: true });
    if (existing.total > 0) return;
    const t0 = Date.now();
    const reports = generateSyntheticHistory({ days: 30, dataClass: 'seed', idPrefix: 'seed' });
    for (const report of reports) {
      await store.insertEvent(report);
    }
    logger.info(
      { count: reports.length, ms: Date.now() - t0 },
      'ingestion.dev_history_seeded (dataClass=seed — development data, clearly labelled)',
    );
  }

  return {
    async start(): Promise<void> {
      stopped = false;
      await store.init();
      await seedMemoryDevHistory();
      unsubscribe = bus.subscribe((message) => {
        if (message.type === 'command:ingestion:run') {
          logger.info({ source: message.source ?? 'ALL' }, 'ingestion.manual_run');
          void runCycle(message.source);
        }
      });
      await store.logEvent({
        level: 'INFO',
        service: 'worker',
        event: 'ingestion.started',
        message: `Ingestion engine started (interval ${env.INGESTION_INTERVAL_MS} ms, providers: ${providers
          .map((p) => p.id)
          .join(', ')})`,
      });
      void runCycle();
      const interval = Math.max(env.INGESTION_INTERVAL_MS, 15_000);
      timer = setInterval(() => {
        if (!stopped) void runCycle();
      }, interval);
    },

    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      await store.logEvent({
        level: 'INFO',
        service: 'worker',
        event: 'ingestion.stopped',
        message: 'Ingestion engine stopped',
      });
    },

    runCycle,
    isRunning: () => running,
    providers: () => providers,
  };
}
