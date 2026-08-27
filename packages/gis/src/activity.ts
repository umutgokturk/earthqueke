import {
  ACTIVITY_DISCLAIMER,
  activityLevelForScore,
  type ActivityComponents,
  type ActivitySnapshot,
} from '@ils/types';
import { haversineKm } from './distance';

/**
 * Activity index — an OBSERVATIONAL statistic, explicitly NOT a prediction.
 * It summarizes the statistical density of already-observed events in a
 * region on a 0–100 scale. It must always ship with ACTIVITY_DISCLAIMER.
 *
 * Components (each 0–100):
 *  - frequency : last-24h event count vs. the prior 30-day daily baseline
 *  - magnitude : maximum observed magnitude in the last 24h
 *  - recency   : exponential decay on time since the latest event (t½ = 3h)
 *  - clustering: spatial concentration of last-7d events on a ~10 km grid
 *  - depth     : share of shallow (<10 km) events in the last 24h
 */

export interface ActivityInput {
  /** Event echoes within the last 30 days for the region, any order. */
  events: Array<{ occurredAt: string; magnitude: number; depthKm: number; latitude: number; longitude: number }>;
  region: string;
  now?: number;
}

export const ACTIVITY_WEIGHTS = {
  frequency: 0.3,
  magnitude: 0.3,
  recency: 0.15,
  clustering: 0.15,
  depth: 0.1,
} as const;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function frequencyScore(count24h: number, baselineDaily: number): number {
  if (baselineDaily <= 0) return count24h > 0 ? 50 : 0;
  const ratio = count24h / baselineDaily;
  if (ratio <= 1) return clamp(ratio * 40);
  return clamp(40 + (ratio - 1) * 30);
}

export function magnitudeScore(maxMag24h: number | null): number {
  if (maxMag24h === null) return 0;
  const m = maxMag24h;
  if (m < 2) return clamp((m / 2) * 10);
  if (m < 3) return clamp(10 + (m - 2) * 30);
  if (m < 4) return clamp(40 + (m - 3) * 30);
  if (m < 5) return clamp(70 + (m - 4) * 20);
  return clamp(90 + (m - 5) * 10);
}

export function recencyScore(minutesSinceLast: number | null): number {
  if (minutesSinceLast === null) return 0;
  if (minutesSinceLast <= 15) return 100;
  const hours = minutesSinceLast / 60;
  return clamp(100 * Math.exp(-Math.LN2 * (hours / 3)));
}

/** Share of last-7d events falling in the densest ~10 km grid cell. */
export function clusteringScore(
  events7d: Array<{ latitude: number; longitude: number }>,
): number {
  const n = events7d.length;
  if (n < 3) return 0;
  const cell = new Map<string, number>();
  for (const e of events7d) {
    // ~0.09° lat ≈ 10 km; scale lon by cos(41°) ≈ 0.75 → ~0.12°
    const key = `${Math.round(e.latitude / 0.09)}:${Math.round(e.longitude / 0.12)}`;
    cell.set(key, (cell.get(key) ?? 0) + 1);
  }
  const maxCell = Math.max(...cell.values());
  const share = maxCell / n;
  const confidence = n < 8 ? 0.5 : 1;
  return clamp(share * 100 * confidence);
}

export function depthScore(depths24h: number[]): number {
  const n = depths24h.length;
  if (n === 0) return 0;
  const shallow10 = depths24h.filter((d) => d < 10).length / n;
  const shallow5 = depths24h.filter((d) => d < 5).length / n;
  return clamp(shallow10 * 80 + shallow5 * 20);
}

export function computeActivity(input: ActivityInput): ActivitySnapshot {
  const now = input.now ?? Date.now();
  const H24 = 86_400_000;
  const D7 = 7 * H24;
  const D30 = 30 * H24;

  const withTs = input.events
    .map((e) => ({ ...e, ts: Date.parse(e.occurredAt) }))
    .filter((e) => Number.isFinite(e.ts) && now - e.ts <= D30 && e.ts <= now + 60_000);

  const last24 = withTs.filter((e) => now - e.ts <= H24);
  const last7d = withTs.filter((e) => now - e.ts <= D7);
  const prior = withTs.filter((e) => now - e.ts > H24);
  const priorDays = Math.max(1, Math.min(29, (D30 - H24) / H24));
  const baselineDaily = prior.length / priorDays;

  const maxMag24h = last24.length ? Math.max(...last24.map((e) => e.magnitude)) : null;
  const latestTs = withTs.length ? Math.max(...withTs.map((e) => e.ts)) : null;
  const minutesSinceLast = latestTs === null ? null : (now - latestTs) / 60_000;

  const components: ActivityComponents = {
    frequency: round1(frequencyScore(last24.length, baselineDaily)),
    magnitude: round1(magnitudeScore(maxMag24h)),
    recency: round1(recencyScore(minutesSinceLast)),
    clustering: round1(clusteringScore(last7d)),
    depth: round1(depthScore(last24.map((e) => e.depthKm))),
  };

  const score = round1(
    components.frequency * ACTIVITY_WEIGHTS.frequency +
      components.magnitude * ACTIVITY_WEIGHTS.magnitude +
      components.recency * ACTIVITY_WEIGHTS.recency +
      components.clustering * ACTIVITY_WEIGHTS.clustering +
      components.depth * ACTIVITY_WEIGHTS.depth,
  );

  return {
    region: input.region,
    score,
    level: activityLevelForScore(score),
    components,
    computedAt: new Date(now).toISOString(),
    windowHours: 24,
    sampleSize: withTs.length,
    disclaimer: ACTIVITY_DISCLAIMER,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Simple statistical grid clustering for the spatial analytics view.
 * Returns cells with counts and max magnitude — presented in the UI as
 * "istatistiksel kümelenme", never as a scientific measurement.
 */
export function gridClusters(
  events: Array<{ latitude: number; longitude: number; magnitude: number }>,
  cellKm = 10,
): Array<{ latitude: number; longitude: number; count: number; maxMagnitude: number }> {
  const latStep = cellKm / 111;
  const lonStep = cellKm / (111 * Math.cos((41 * Math.PI) / 180));
  const cells = new Map<string, { latSum: number; lonSum: number; count: number; maxMag: number }>();
  for (const e of events) {
    const key = `${Math.round(e.latitude / latStep)}:${Math.round(e.longitude / lonStep)}`;
    const c = cells.get(key) ?? { latSum: 0, lonSum: 0, count: 0, maxMag: -Infinity };
    c.latSum += e.latitude;
    c.lonSum += e.longitude;
    c.count += 1;
    c.maxMag = Math.max(c.maxMag, e.magnitude);
    cells.set(key, c);
  }
  return [...cells.values()]
    .map((c) => ({
      latitude: c.latSum / c.count,
      longitude: c.lonSum / c.count,
      count: c.count,
      maxMagnitude: c.maxMag,
    }))
    .sort((a, b) => b.count - a.count);
}

export { haversineKm };
