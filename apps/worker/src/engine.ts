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
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR' | 'SKIPPED' | 'BACKOFF';
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
  /** A sourceFilter (manual run) bypasses failure backoff for that source. */
  runCycle(sourceFilter?: string): Promise<CycleSummary[]>;
  isRunning(): boolean;
  providers(): EarthquakeProvider[];
}

/**
 * Human-diagnosable error text: Node's fetch wraps the real network/TLS error
 * in `cause` ("fetch failed" alone says nothing) — surface its code/message.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cause = (err as { cause?: unknown }).cause;
  for (let depth = 0; depth < 3 && cause instanceof Error; depth += 1) {
    const code = (cause as { code?: string }).code;
    parts.push(code ?? cause.message);
    cause = (cause as { cause?: unknown }).cause;
  }
  const detail = parts.slice(1).filter(Boolean);
  return detail.length > 0 ? `${parts[0]} (${detail.join(' ← ')})` : parts[0]!;
}

/** Retry delay after consecutive failures: interval·2^n, capped at 5 minutes. */
export function failureBackoffMs(errorCount: number, intervalMs: number): number {
  const exp = Math.min(Math.max(errorCount, 1), 5);
  return Math.min(5 * 60_000, intervalMs * 2 ** exp);
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
  /** Per-source "do not retry before" timestamps (failure backoff). */
  const backoffUntil = new Map<string, number>();

  async function processProvider(provider: EarthquakeProvider, force: boolean): Promise<CycleSummary> {
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
    // Captured up front: patchSource may mutate the same object later.
    const previousErrorCount = registry?.errorCount ?? 0;
    if (registry && !registry.enabled) {
      summary.status = 'SKIPPED';
      await store.patchSource(provider.id, { status: 'DISABLED' });
      return summary;
    }
    // Failing source in its backoff window → quiet skip (no run, no log spam).
    // Manual runs (force) always attempt, so the admin button stays usable.
    if (!force && (backoffUntil.get(provider.id) ?? 0) > Date.now()) {
      summary.status = 'BACKOFF';
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
      backoffUntil.delete(provider.id);
      await store.patchSource(provider.id, {
        status: 'ONLINE',
        lastSuccessAt: new Date().toISOString(),
        latencyMs: summary.latencyMs,
        errorCount: 0,
        lastError: null,
      });
      if (previousErrorCount > 0) {
        await store.logEvent({
          level: 'INFO',
          service: 'worker',
          event: 'ingestion.provider_recovered',
          message: `${provider.id} yeniden erişilebilir (önceki hata sayısı: ${previousErrorCount}).`,
          context: { source: provider.id },
        });
        logger.info({ source: provider.id }, 'ingestion.provider_recovered');
      }
    } catch (err) {
      const message = describeError(err);
      summary.status = 'ERROR';
      summary.error = message;
      summary.latencyMs = Date.now() - t0;
      await store.finishRun(runId, { status: 'ERROR', error: message, fetched: summary.fetched });
      const current = (await store.listSources()).find((s) => s.id === provider.id);
      const errorCount = (current?.errorCount ?? 0) + 1;
      backoffUntil.set(provider.id, Date.now() + failureBackoffMs(errorCount, env.INGESTION_INTERVAL_MS));
      await store.patchSource(provider.id, {
        status: errorCount >= OFFLINE_AFTER_ERRORS ? 'OFFLINE' : 'DEGRADED',
        lastErrorAt: new Date().toISOString(),
        lastError: message,
        errorCount,
        latencyMs: summary.latencyMs,
      });
      // Persist to the system log only on transitions (first failure, OFFLINE),
      // and damp console warnings so a long outage does not flood the logs.
      if (errorCount === 1 || errorCount === OFFLINE_AFTER_ERRORS) {
        await store.logEvent({
          level: 'ERROR',
          service: 'worker',
          event: 'ingestion.provider_error',
          message: `${provider.id}: ${message}`,
          context: { source: provider.id, errorCount },
        });
      }
      const logPayload = {
        source: provider.id,
        error: message,
        errorCount,
        nextRetryInSeconds: Math.round(failureBackoffMs(errorCount, env.INGESTION_INTERVAL_MS) / 1000),
      };
      if (errorCount <= OFFLINE_AFTER_ERRORS || errorCount % 10 === 0) {
        logger.warn(logPayload, 'ingestion.provider_error');
      } else {
        logger.debug(logPayload, 'ingestion.provider_error');
      }
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
      const force = sourceFilter !== undefined;
      for (const provider of providers) {
        if (sourceFilter && provider.id !== sourceFilter) continue;
        summaries.push(await processProvider(provider, force));
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
