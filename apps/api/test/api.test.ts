import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '@ils/config';
import { LocalBus, MemoryCache, MemoryStore } from '@ils/database';
import type { EarthquakeReport } from '@ils/types';
import { buildServer } from '../src/server';

function report(overrides: Partial<EarthquakeReport>): EarthquakeReport {
  return {
    id: `r-${Math.random().toString(36).slice(2)}`,
    source: 'AFAD',
    sourceEventId: overrides.sourceEventId ?? `se-${Math.random().toString(36).slice(2)}`,
    occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    latitude: 40.86,
    longitude: 28.86,
    depthKm: 8.2,
    magnitude: 2.2,
    magnitudeType: 'ML',
    location: 'Marmara Denizi - Silivri Açıkları (İstanbul)',
    dataClass: 'live',
    ...overrides,
  };
}

describe('REST API (fastify.inject integration, memory store)', () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let insertedId = '';

  beforeAll(async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-secret-1',
      ADMIN_JWT_SECRET: 'test-jwt-secret',
    } as NodeJS.ProcessEnv);
    store = new MemoryStore();
    await store.init();
    const first = await store.insertEvent(report({ magnitude: 3.4, occurredAt: new Date(Date.now() - 30 * 60_000).toISOString() }));
    insertedId = first.id;
    await store.insertEvent(report({ magnitude: 1.4, latitude: 40.87, longitude: 29.05 }));
    await store.insertEvent(report({ magnitude: 2.0, source: 'KANDILLI', latitude: 40.7, longitude: 28.2 }));
    const built = await buildServer({
      env,
      store,
      cache: new MemoryCache(),
      bus: new LocalBus(),
      logger: false,
    });
    app = built.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responds ok', async () => {
    const res = await app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('GET /api/earthquakes lists events with pagination envelope', async () => {
    const res = await app.inject({ url: '/api/earthquakes?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].sources.length).toBeGreaterThan(0);
  });

  it('filters propagate: minMagnitude & source', async () => {
    const m3 = await app.inject({ url: '/api/earthquakes?minMagnitude=3' });
    expect(m3.json().total).toBe(1);
    const kandilli = await app.inject({ url: '/api/earthquakes?source=KANDILLI' });
    expect(kandilli.json().total).toBe(1);
  });

  it('rejects invalid query values via schema validation', async () => {
    const res = await app.inject({ url: '/api/earthquakes?range=99h' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/earthquakes/stats returns KPI block', async () => {
    const res = await app.inject({ url: '/api/earthquakes/stats' });
    const body = res.json();
    expect(body.counts.h24).toBe(3);
    expect(body.maxMagnitude24h.value).toBeCloseTo(3.4);
    expect(body.nearestToIstanbul24h.event).toBeTruthy();
  });

  it('GET /api/earthquakes/timeline returns dense buckets', async () => {
    const res = await app.inject({ url: '/api/earthquakes/timeline?range=6h' });
    const buckets = res.json();
    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBeGreaterThanOrEqual(24);
    expect(buckets.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(3);
  });

  it('GET /api/earthquakes/:id returns detail; unknown id → 404', async () => {
    const res = await app.inject({ url: `/api/earthquakes/${insertedId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(insertedId);
    const missing = await app.inject({ url: '/api/earthquakes/does-not-exist' });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /api/earthquakes/export returns CSV with the specified columns', async () => {
    const res = await app.inject({ url: '/api/earthquakes/export?range=24h' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const firstLine = res.body.split('\n')[0]!;
    for (const col of ['id', 'date', 'time', 'magnitude', 'depth', 'latitude', 'longitude', 'location', 'source', 'nearest_fault', 'distance_to_fault']) {
      expect(firstLine).toContain(col);
    }
    expect(res.body.split('\n').length).toBeGreaterThan(3);
  });

  it('GET /api/faults returns segments with source metadata and approximate flag', async () => {
    const res = await app.inject({ url: '/api/faults' });
    const faults = res.json();
    expect(faults.length).toBeGreaterThanOrEqual(5);
    const adalar = faults.find((f: { slug: string }) => f.slug === 'adalar-segmenti');
    expect(adalar).toBeTruthy();
    expect(adalar.approximate).toBe(true);
    expect(adalar.source.length).toBeGreaterThan(10);
    expect(adalar.geometry.type).toBe('LineString');
  });

  it('GET /api/faults/:id/stats aggregates windows', async () => {
    const res = await app.inject({ url: '/api/faults/adalar-segmenti/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().counts.h24).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/activity always carries the non-prediction disclaimer', async () => {
    const res = await app.inject({ url: '/api/activity' });
    const snapshots = res.json();
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    for (const s of snapshots) {
      expect(s.disclaimer).toContain('deprem tahmini değildir');
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  it('GET /api/search finds across entity types', async () => {
    const res = await app.inject({ url: '/api/search?q=silivri' });
    const body = res.json();
    expect(body.earthquakes.length + body.faults.length + body.regions.length).toBeGreaterThan(0);
    expect(body.regions.some((r: { slug: string }) => r.slug === 'silivri')).toBe(true);
  });

  it('GET /api/system/status reports subsystem health', async () => {
    const res = await app.inject({ url: '/api/system/status' });
    const body = res.json();
    expect(body.database.mode).toBe('memory');
    expect(body.database.ok).toBe(true);
    expect(body.cache.mode).toBe('memory');
    expect(typeof body.websocket.clients).toBe('number');
  });

  describe('admin auth', () => {
    it('admin endpoints reject unauthenticated requests', async () => {
      const res = await app.inject({ url: '/api/admin/overview' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects wrong credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { username: 'admin', password: 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('logs in, sets an httpOnly cookie, grants access; mutations need the CSRF header', async () => {
      const login = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { username: 'admin', password: 'test-secret-1' },
      });
      expect(login.statusCode).toBe(200);
      const cookie = login.cookies.find((c) => c.name === 'ils_admin');
      expect(cookie).toBeTruthy();
      expect(cookie!.httpOnly).toBe(true);

      const me = await app.inject({ url: '/api/admin/me', cookies: { ils_admin: cookie!.value } });
      expect(me.statusCode).toBe(200);

      const noCsrf = await app.inject({
        method: 'PATCH',
        url: '/api/admin/sources/MOCK',
        cookies: { ils_admin: cookie!.value },
        payload: { enabled: false },
      });
      expect(noCsrf.statusCode).toBe(403);

      const withCsrf = await app.inject({
        method: 'PATCH',
        url: '/api/admin/sources/MOCK',
        cookies: { ils_admin: cookie!.value },
        headers: { 'x-ils-admin': '1' },
        payload: { enabled: false },
      });
      expect(withCsrf.statusCode).toBe(200);
      expect(withCsrf.json().enabled).toBe(false);
    });
  });
});
