import { beforeEach, describe, expect, it } from 'vitest';
import type { EarthquakeReport } from '@ils/types';
import { MemoryStore } from '../src/memory-store';

function report(overrides: Partial<EarthquakeReport>): EarthquakeReport {
  return {
    id: `r-${Math.random().toString(36).slice(2)}`,
    source: 'AFAD',
    sourceEventId: overrides.sourceEventId ?? `se-${Math.random().toString(36).slice(2)}`,
    occurredAt: new Date().toISOString(),
    latitude: 40.85,
    longitude: 28.9,
    depthKm: 8,
    magnitude: 2.0,
    magnitudeType: 'ML',
    location: 'Marmara Denizi',
    dataClass: 'live',
    ...overrides,
  };
}

const opts = { includeSynthetic: true };

describe('MemoryStore (reference DataStore implementation)', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.init();
  });

  it('enriches inserted events spatially (nearest fault, Istanbul distance, sea flag)', async () => {
    const event = await store.insertEvent(report({ latitude: 40.87, longitude: 28.65 }));
    expect(event.nearestFaultSlug).toBe('kumburgaz-segmenti');
    expect(event.nearestFaultDistanceKm).not.toBeNull();
    expect(event.nearestFaultDistanceKm!).toBeLessThan(10);
    expect(event.istanbulDistanceKm).toBeGreaterThan(10);
    expect(event.inMarmaraSea).toBe(true);
    expect(event.inIstanbul).toBe(false);
  });

  it('merges a second source into the same event and keeps both sources', async () => {
    const a = await store.insertEvent(report({ source: 'KANDILLI', magnitude: 2.2 }));
    const { event, changed } = await store.mergeReport(
      a.id,
      report({ source: 'AFAD', sourceEventId: 'afad-9', magnitude: 2.4 }),
    );
    expect(event.sources.map((s) => s.source).sort()).toEqual(['AFAD', 'KANDILLI']);
    // AFAD has higher priority → canonical fields switch to AFAD's report
    expect(event.source).toBe('AFAD');
    expect(event.magnitude).toBeCloseTo(2.4);
    expect(changed).toBe(true);
  });

  it('spatial candidate query respects time tolerance and radius', async () => {
    const t = Date.parse('2026-08-27T10:00:00Z');
    await store.insertEvent(report({ occurredAt: new Date(t).toISOString() }));
    await store.insertEvent(
      report({ occurredAt: new Date(t + 30_000).toISOString(), latitude: 41.4, longitude: 29.9 }),
    );
    const candidates = await store.getCandidates({
      occurredAt: new Date(t + 10_000).toISOString(),
      toleranceSeconds: 90,
      latitude: 40.85,
      longitude: 28.9,
      radiusKm: 15,
    });
    expect(candidates).toHaveLength(1);
  });

  it('filters by magnitude, depth, source and region', async () => {
    await store.insertEvent(report({ magnitude: 1.2, depthKm: 4, latitude: 40.86, longitude: 29.06 })); // near Adalar
    await store.insertEvent(report({ magnitude: 3.1, depthKm: 12, source: 'KANDILLI', latitude: 40.7, longitude: 28.2 }));

    const m3 = await store.queryEarthquakes({ minMagnitude: 3 }, opts);
    expect(m3.total).toBe(1);
    const shallow = await store.queryEarthquakes({ minDepth: 0, maxDepth: 5 }, opts);
    expect(shallow.total).toBe(1);
    const kandilli = await store.queryEarthquakes({ source: 'KANDILLI' }, opts);
    expect(kandilli.total).toBe(1);
    const marmara = await store.queryEarthquakes({ region: 'marmara' }, opts);
    expect(marmara.total).toBe(2);
    const adalar = await store.queryEarthquakes({ region: 'adalar' }, opts);
    expect(adalar.total).toBe(1);
  });

  it('excludes synthetic data when includeSynthetic=false (production behaviour)', async () => {
    await store.insertEvent(report({ dataClass: 'seed', source: 'MOCK' }));
    await store.insertEvent(report({ dataClass: 'live' }));
    const prod = await store.queryEarthquakes({}, { includeSynthetic: false });
    expect(prod.total).toBe(1);
    expect(prod.items[0]!.dataClass).toBe('live');
    const dev = await store.queryEarthquakes({}, { includeSynthetic: true });
    expect(dev.total).toBe(2);
  });

  it('timeline buckets are dense (empty buckets included) and counts add up', async () => {
    const now = Date.now();
    await store.insertEvent(report({ occurredAt: new Date(now - 30 * 60_000).toISOString() }));
    await store.insertEvent(report({ occurredAt: new Date(now - 35 * 60_000).toISOString() }));
    const buckets = await store.timeline({
      from: new Date(now - 6 * 3_600_000).toISOString(),
      to: new Date(now).toISOString(),
      bucketMs: 15 * 60_000,
      includeSynthetic: true,
    });
    expect(buckets.length).toBeGreaterThanOrEqual(24);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(2);
    expect(buckets.some((b) => b.count === 0)).toBe(true);
  });

  it('distribution: magnitude bins and fault attribution (≤ 10 km association)', async () => {
    const now = Date.now();
    const at = new Date(now - 60_000).toISOString();
    await store.insertEvent(report({ occurredAt: at, magnitude: 1.4, latitude: 40.87, longitude: 28.65 }));
    await store.insertEvent(report({ occurredAt: at, magnitude: 2.5, latitude: 40.87, longitude: 28.65 }));
    await store.insertEvent(report({ occurredAt: at, magnitude: 3.2, latitude: 41.1, longitude: 29.61 })); // Şile — far from faults
    const magDist = await store.distribution(
      'magnitude',
      new Date(now - 86_400_000).toISOString(),
      new Date(now).toISOString(),
      undefined,
      opts,
    );
    expect(magDist.find((b) => b.key === '0')!.count).toBe(1);
    expect(magDist.find((b) => b.key === '2')!.count).toBe(1);
    expect(magDist.find((b) => b.key === '3')!.count).toBe(1);

    const faultDist = await store.distribution(
      'fault',
      new Date(now - 86_400_000).toISOString(),
      new Date(now).toISOString(),
      undefined,
      opts,
    );
    const kumburgaz = faultDist.find((b) => b.key === 'kumburgaz-segmenti');
    expect(kumburgaz?.count).toBe(2); // the Şile event is farther than 10 km from any segment
  });

  it('fault stats aggregate windows and expose the closest event', async () => {
    await store.insertEvent(report({ latitude: 40.865, longitude: 28.65, magnitude: 2.9 }));
    const stats = await store.faultStats('kumburgaz-segmenti', opts);
    expect(stats).not.toBeNull();
    expect(stats!.counts.h24).toBe(1);
    expect(stats!.maxMagnitude).toBeCloseTo(2.9);
    expect(stats!.closestEvent).not.toBeNull();
  });

  it('search finds earthquakes, faults and regions', async () => {
    await store.insertEvent(report({ location: 'Adalar Açıkları' }));
    const res = await store.search('adalar', 5, opts);
    expect(res.earthquakes.length).toBeGreaterThan(0);
    expect(res.faults.some((f) => f.slug === 'adalar-segmenti')).toBe(true);
    expect(res.regions.some((r) => r.slug === 'adalar')).toBe(true);
  });
});
