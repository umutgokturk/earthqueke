import { describe, expect, it } from 'vitest';
import type { Earthquake, EarthquakeReport } from '@ils/types';
import { findMatch, scoreMatch } from '../src/dedupe';
import { validateReport } from '../src/validate';

const baseReport: EarthquakeReport = {
  id: 'afad-1',
  source: 'AFAD',
  sourceEventId: '1',
  occurredAt: '2026-08-27T10:00:00.000Z',
  latitude: 40.85,
  longitude: 28.9,
  depthKm: 9.1,
  magnitude: 2.4,
  magnitudeType: 'ML',
  location: 'Marmara Denizi',
};

function eventLike(overrides: Partial<Earthquake>): Earthquake {
  return {
    id: 'evt-1',
    occurredAt: '2026-08-27T10:00:20.000Z',
    latitude: 40.86,
    longitude: 28.91,
    depthKm: 8.9,
    magnitude: 2.5,
    magnitudeType: 'ML',
    location: 'Marmara Denizi',
    source: 'KANDILLI',
    dataClass: 'live',
    sources: [],
    istanbulDistanceKm: 20,
    nearestFaultId: null,
    nearestFaultSlug: null,
    nearestFaultName: null,
    nearestFaultDistanceKm: null,
    districtSlug: null,
    districtName: null,
    inIstanbul: false,
    inMarmaraSea: true,
    createdAt: '2026-08-27T10:00:25.000Z',
    updatedAt: '2026-08-27T10:00:25.000Z',
    ...overrides,
  };
}

const cfg = { timeSeconds: 90, distanceKm: 15, magnitudeDelta: 0.7 };

describe('validateReport', () => {
  it('accepts a well-formed report', () => {
    const res = validateReport(baseReport);
    expect(res.ok).toBe(true);
  });

  it.each([
    ['latitude out of range', { latitude: 95 }],
    ['longitude out of range', { longitude: -195 }],
    ['negative depth', { depthKm: -2 }],
    ['negative magnitude', { magnitude: -0.1 }],
    ['broken date', { occurredAt: 'not-a-date' }],
  ])('rejects %s', (_name, patch) => {
    const res = validateReport({ ...baseReport, ...patch });
    expect(res.ok).toBe(false);
  });

  it('rejects timestamps from the future', () => {
    const res = validateReport(
      { ...baseReport, occurredAt: new Date(Date.now() + 3_600_000).toISOString() },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('future');
  });
});

describe('duplicate engine', () => {
  it('matches the same physical event reported by another source', () => {
    const candidate = eventLike({});
    expect(findMatch(baseReport, [candidate], cfg)).toBe(candidate);
  });

  it('rejects matches outside the time window', () => {
    const candidate = eventLike({ occurredAt: '2026-08-27T10:05:00.000Z' });
    expect(findMatch(baseReport, [candidate], cfg)).toBeNull();
  });

  it('rejects matches that are too far away', () => {
    const candidate = eventLike({ latitude: 41.2, longitude: 29.5 });
    expect(findMatch(baseReport, [candidate], cfg)).toBeNull();
  });

  it('rejects matches with too large a magnitude difference', () => {
    const candidate = eventLike({ magnitude: 3.5 });
    expect(findMatch(baseReport, [candidate], cfg)).toBeNull();
  });

  it('prefers the closest combined match among several candidates', () => {
    const near = eventLike({ id: 'near', occurredAt: '2026-08-27T10:00:05.000Z', latitude: 40.851 });
    const far = eventLike({ id: 'far', occurredAt: '2026-08-27T10:01:20.000Z', latitude: 40.94 });
    expect(findMatch(baseReport, [far, near], cfg)?.id).toBe('near');
  });

  it('exposes distance/time deltas for observability', () => {
    const match = scoreMatch(baseReport, eventLike({}), cfg);
    expect(match).not.toBeNull();
    expect(match!.deltaSeconds).toBeCloseTo(20);
    expect(match!.distanceKm).toBeGreaterThan(0);
    expect(match!.distanceKm).toBeLessThan(3);
  });
});
