import { describe, expect, it } from 'vitest';
import { loadEnv } from '@ils/config';
import { LocalBus, MemoryStore } from '@ils/database';
import type { BusMessage } from '@ils/database';
import type { EarthquakeReport } from '@ils/types';
import { createIngestionEngine } from '../src/engine';
import type { EarthquakeProvider } from '../src/providers/types';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function testEnv() {
  return loadEnv({
    NODE_ENV: 'test',
    MOCK_PROVIDER_ENABLED: 'false',
    INGESTION_INTERVAL_MS: '20000',
  } as NodeJS.ProcessEnv);
}

function stubProvider(id: 'AFAD' | 'KANDILLI', reports: () => EarthquakeReport[]): EarthquakeProvider {
  return { id, name: id, getLatestEarthquakes: async () => reports() };
}

const t0 = Date.now() - 60_000;

function afadReport(): EarthquakeReport {
  return {
    id: 'afad-100',
    source: 'AFAD',
    sourceEventId: '100',
    occurredAt: new Date(t0).toISOString(),
    latitude: 40.86,
    longitude: 28.86,
    depthKm: 9.2,
    magnitude: 2.3,
    magnitudeType: 'ML',
    location: 'Marmara Denizi - Silivri Açıkları',
    dataClass: 'live',
  };
}

function kandilliReport(): EarthquakeReport {
  return {
    id: 'koeri-x',
    source: 'KANDILLI',
    sourceEventId: 'koeri-x',
    occurredAt: new Date(t0 + 15_000).toISOString(),
    latitude: 40.87,
    longitude: 28.87,
    depthKm: 8.8,
    magnitude: 2.5,
    magnitudeType: 'ML',
    location: 'MARMARA DENIZI',
    dataClass: 'live',
  };
}

describe('ingestion engine (fetch→validate→dedupe→store→broadcast)', () => {
  it('inserts new events, merges cross-source duplicates and broadcasts', async () => {
    const env = testEnv();
    const store = new MemoryStore();
    await store.init();
    const bus = new LocalBus();
    const messages: BusMessage[] = [];
    bus.subscribe((m) => messages.push(m));

    const engine = createIngestionEngine({ env, store, bus, logger: silentLogger }, [
      stubProvider('AFAD', () => [afadReport()]),
      stubProvider('KANDILLI', () => [kandilliReport()]),
    ]);

    const summaries = await engine.runCycle();
    expect(summaries.find((s) => s.source === 'AFAD')!.inserted).toBe(1);
    expect(summaries.find((s) => s.source === 'KANDILLI')!.merged).toBe(1);

    // one canonical event carrying both sources
    const all = await store.queryEarthquakes({}, { includeSynthetic: true });
    expect(all.total).toBe(1);
    expect(all.items[0]!.sources.map((s) => s.source).sort()).toEqual(['AFAD', 'KANDILLI']);
    expect(all.items[0]!.source).toBe('AFAD'); // priority source wins canonical fields

    const newEvents = messages.filter((m) => m.type === 'earthquake:new');
    const updatedEvents = messages.filter((m) => m.type === 'earthquake:updated');
    expect(newEvents).toHaveLength(1);
    expect(updatedEvents.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.type === 'activity:update')).toBe(true);
    expect(messages.some((m) => m.type === 'sources:status')).toBe(true);
  });

  it('re-reports from the same source update the event instead of duplicating', async () => {
    const env = testEnv();
    const store = new MemoryStore();
    await store.init();
    const bus = new LocalBus();
    let magnitude = 2.3;
    const engine = createIngestionEngine({ env, store, bus, logger: silentLogger }, [
      stubProvider('AFAD', () => [{ ...afadReport(), magnitude }]),
    ]);

    await engine.runCycle();
    magnitude = 2.7; // revision
    const summaries = await engine.runCycle();
    expect(summaries[0]!.updated).toBe(1);
    const all = await store.queryEarthquakes({}, { includeSynthetic: true });
    expect(all.total).toBe(1);
    expect(all.items[0]!.magnitude).toBeCloseTo(2.7);
  });

  it('rejects invalid reports and counts them, without failing the run', async () => {
    const env = testEnv();
    const store = new MemoryStore();
    await store.init();
    const engine = createIngestionEngine({ env, store, bus: new LocalBus(), logger: silentLogger }, [
      stubProvider('AFAD', () => [
        afadReport(),
        { ...afadReport(), id: 'bad', sourceEventId: 'bad', latitude: 123 },
      ]),
    ]);
    const [summary] = await engine.runCycle();
    expect(summary!.status).toBe('SUCCESS');
    expect(summary!.inserted).toBe(1);
    expect(summary!.invalid).toBe(1);
  });

  it('marks a failing provider DEGRADED, then OFFLINE after repeated errors — other sources keep working', async () => {
    const env = testEnv();
    const store = new MemoryStore();
    await store.init();
    const failing: EarthquakeProvider = {
      id: 'KANDILLI',
      name: 'KANDILLI',
      getLatestEarthquakes: async () => {
        throw new Error('upstream down');
      },
    };
    const engine = createIngestionEngine({ env, store, bus: new LocalBus(), logger: silentLogger }, [
      stubProvider('AFAD', () => [afadReport()]),
      failing,
    ]);

    await engine.runCycle();
    let sources = await store.listSources();
    expect(sources.find((s) => s.id === 'AFAD')!.status).toBe('ONLINE');
    expect(sources.find((s) => s.id === 'KANDILLI')!.status).toBe('DEGRADED');

    await engine.runCycle();
    await engine.runCycle();
    sources = await store.listSources();
    expect(sources.find((s) => s.id === 'KANDILLI')!.status).toBe('OFFLINE');
    expect(sources.find((s) => s.id === 'KANDILLI')!.lastError).toContain('upstream down');

    const runs = await store.listRuns(10);
    expect(runs.some((r) => r.status === 'ERROR' && r.source === 'KANDILLI')).toBe(true);
  });

  it('skips disabled sources', async () => {
    const env = testEnv();
    const store = new MemoryStore();
    await store.init();
    await store.patchSource('AFAD', { enabled: false });
    const engine = createIngestionEngine({ env, store, bus: new LocalBus(), logger: silentLogger }, [
      stubProvider('AFAD', () => [afadReport()]),
    ]);
    const [summary] = await engine.runCycle();
    expect(summary!.status).toBe('SKIPPED');
    const all = await store.queryEarthquakes({}, { includeSynthetic: true });
    expect(all.total).toBe(0);
  });
});
