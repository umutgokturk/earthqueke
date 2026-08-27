import { describe, expect, it } from 'vitest';
import {
  FAULT_SEEDS,
  ISTANBUL_POLYGON,
  MARMARA_SEA_POLYGON,
  classifyDistrict,
  computeActivity,
  frequencyScore,
  haversineKm,
  magnitudeScore,
  nearestFault,
  pointInPolygon,
  pointToPolylineKm,
  recencyScore,
} from '../src';

describe('distance calculator', () => {
  it('haversine matches known distances (Istanbul → Ankara ≈ 350 km)', () => {
    const d = haversineKm(41.0082, 28.9784, 39.9334, 32.8597);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(370);
  });

  it('is zero for identical points and symmetric', () => {
    expect(haversineKm(40.9, 29.1, 40.9, 29.1)).toBeCloseTo(0);
    expect(haversineKm(40.5, 28.0, 41.0, 29.0)).toBeCloseTo(haversineKm(41.0, 29.0, 40.5, 28.0), 6);
  });

  it('point-to-polyline: point on the line is ~0, offset point matches latitude offset', () => {
    const line: [number, number][] = [
      [28.0, 40.85],
      [29.0, 40.85],
    ];
    expect(pointToPolylineKm(40.85, 28.5, line)).toBeLessThan(0.05);
    // 0.09° latitude ≈ 10 km
    const d = pointToPolylineKm(40.94, 28.5, line);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(11);
    // beyond the endpoint the distance is to the endpoint itself
    const dEnd = pointToPolylineKm(40.85, 29.2, line);
    expect(dEnd).toBeCloseTo(haversineKm(40.85, 29.2, 40.85, 29.0), 0);
  });
});

describe('nearest fault attribution', () => {
  it('attributes a point near Adalar to the Adalar segment and excludes zones', () => {
    const faults = FAULT_SEEDS.map((f, i) => ({ ...f, id: String(i) }));
    const hit = nearestFault(40.84, 29.05, faults);
    expect(hit).not.toBeNull();
    expect(hit!.fault.slug).toBe('adalar-segmenti');
    expect(hit!.fault.isZone).toBe(false);
    expect(hit!.distanceKm).toBeLessThan(10);
  });
});

describe('region polygons & districts', () => {
  it('classifies Istanbul land vs. the Marmara Sea', () => {
    // Kadıköy (land)
    expect(pointInPolygon(41.0, 29.03, ISTANBUL_POLYGON)).toBe(true);
    expect(pointInPolygon(41.0, 29.03, MARMARA_SEA_POLYGON)).toBe(false);
    // Central Marmara (sea)
    expect(pointInPolygon(40.7, 28.2, MARMARA_SEA_POLYGON)).toBe(true);
    expect(pointInPolygon(40.7, 28.2, ISTANBUL_POLYGON)).toBe(false);
    // Ankara — neither
    expect(pointInPolygon(39.93, 32.86, ISTANBUL_POLYGON)).toBe(false);
    expect(pointInPolygon(39.93, 32.86, MARMARA_SEA_POLYGON)).toBe(false);
  });

  it('assigns districts by nearest centroid within radius', () => {
    expect(classifyDistrict(40.98, 29.04, haversineKm)?.slug).toBe('kadikoy');
    expect(classifyDistrict(40.87, 29.09, haversineKm)?.slug).toBe('adalar');
    expect(classifyDistrict(40.4, 27.5, haversineKm)).toBeNull(); // open sea
  });
});

describe('activity score (observational, not a prediction)', () => {
  it('score components behave monotonically', () => {
    expect(frequencyScore(0, 10)).toBe(0);
    expect(frequencyScore(10, 10)).toBeCloseTo(40);
    expect(frequencyScore(30, 10)).toBeGreaterThan(frequencyScore(15, 10));
    expect(magnitudeScore(null)).toBe(0);
    expect(magnitudeScore(3.5)).toBeGreaterThan(magnitudeScore(2.5));
    expect(recencyScore(5)).toBe(100);
    expect(recencyScore(600)).toBeLessThan(recencyScore(60));
  });

  it('computes a bounded snapshot with the mandatory disclaimer', () => {
    const now = Date.parse('2026-08-27T12:00:00Z');
    const events = Array.from({ length: 60 }, (_, i) => ({
      occurredAt: new Date(now - i * 3_600_000).toISOString(),
      magnitude: 1.5 + (i % 5) * 0.3,
      depthKm: 6 + (i % 7),
      latitude: 40.85 + (i % 3) * 0.01,
      longitude: 28.9 + (i % 3) * 0.01,
    }));
    const snap = computeActivity({ events, region: 'marmara', now });
    expect(snap.score).toBeGreaterThan(0);
    expect(snap.score).toBeLessThanOrEqual(100);
    expect(['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'VERY_HIGH']).toContain(snap.level);
    expect(snap.disclaimer).toContain('deprem tahmini değildir');
    expect(snap.sampleSize).toBe(60);
  });

  it('an empty region yields LOW with score 0', () => {
    const snap = computeActivity({ events: [], region: 'istanbul' });
    expect(snap.score).toBe(0);
    expect(snap.level).toBe('LOW');
  });
});
