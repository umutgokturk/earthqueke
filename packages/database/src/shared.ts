import { DEPTH_BINS, MAGNITUDE_BINS, SOURCE_PRIORITY } from '@ils/config';
import type { DistributionBin, EarthquakeSourceRecord, TimelineBucket } from '@ils/types';

/**
 * Pick the source record that provides the canonical (authoritative) fields
 * for a deduplicated event: highest priority source wins; within the same
 * source the most recently seen report wins (revisions).
 */
export function pickCanonical(sources: EarthquakeSourceRecord[]): EarthquakeSourceRecord {
  if (sources.length === 0) throw new Error('pickCanonical: empty source list');
  return [...sources].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? 0;
    const pb = SOURCE_PRIORITY[b.source] ?? 0;
    if (pa !== pb) return pb - pa;
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  })[0]!;
}

/** Align a timestamp down to its bucket start. */
export function bucketStart(ts: number, bucketMs: number): number {
  return Math.floor(ts / bucketMs) * bucketMs;
}

/**
 * Fill a sparse bucket map into a dense, ordered timeline (empty buckets
 * included) so charts never have gaps the frontend must repair.
 */
export function fillTimeline(
  sparse: Map<number, { count: number; maxMagnitude: number | null; sumMagnitude: number; sumDepth: number }>,
  fromMs: number,
  toMs: number,
  bucketMs: number,
): TimelineBucket[] {
  const out: TimelineBucket[] = [];
  const start = bucketStart(fromMs, bucketMs);
  for (let t = start; t <= toMs; t += bucketMs) {
    const b = sparse.get(t);
    out.push({
      t: new Date(t).toISOString(),
      count: b?.count ?? 0,
      maxMagnitude: b?.maxMagnitude ?? null,
      avgMagnitude: b && b.count > 0 ? round2(b.sumMagnitude / b.count) : null,
      avgDepthKm: b && b.count > 0 ? round2(b.sumDepth / b.count) : null,
    });
  }
  return out;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function magnitudeBins(values: number[]): DistributionBin[] {
  return MAGNITUDE_BINS.map((bin) => ({
    key: bin.key,
    label: bin.label,
    count: values.filter((m) => m >= bin.min && m < bin.max).length,
  }));
}

export function depthBins(values: number[]): DistributionBin[] {
  return DEPTH_BINS.map((bin) => ({
    key: bin.key,
    label: bin.label,
    count: values.filter((d) => d >= bin.min && d < bin.max).length,
  }));
}

/**
 * Hour-of-day (00–23) in Turkey time. Turkey is fixed at UTC+3 (no DST since
 * 2016), so plain offset arithmetic is exact and identical to the SQL
 * `occurred_at AT TIME ZONE 'Europe/Istanbul'` path.
 */
export function istanbulHour(iso: string): number {
  const d = new Date(Date.parse(iso) + 3 * 3_600_000);
  return d.getUTCHours();
}

/** Calendar date (YYYY-MM-DD) in Turkey time. */
export function istanbulDay(iso: string): string {
  const d = new Date(Date.parse(iso) + 3 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

export function hourBins(isoTimes: string[]): DistributionBin[] {
  const counts = new Array<number>(24).fill(0);
  for (const t of isoTimes) counts[istanbulHour(t)]! += 1;
  return counts.map((count, h) => ({
    key: String(h),
    label: `${String(h).padStart(2, '0')}:00`,
    count,
  }));
}

/** Minimal projected row shape shared by both stores for distributions. */
export interface DistRow {
  occurredAt: string;
  magnitude: number;
  depthKm: number;
  faultSlug: string | null;
  faultName: string | null;
  faultDistanceKm: number | null;
  districtSlug: string | null;
  districtName: string | null;
}

export function computeDistribution(
  kind: 'magnitude' | 'depth' | 'fault' | 'district' | 'hour' | 'day',
  rows: DistRow[],
  fromMs: number,
  toMs: number,
  faultAssociationKm: number,
): DistributionBin[] {
  switch (kind) {
    case 'magnitude':
      return magnitudeBins(rows.map((r) => r.magnitude));
    case 'depth':
      return depthBins(rows.map((r) => r.depthKm));
    case 'hour':
      return hourBins(rows.map((r) => r.occurredAt));
    case 'day':
      return dayBins(rows.map((r) => r.occurredAt), fromMs, toMs);
    case 'fault': {
      const byKey = new Map<string, { label: string; count: number; maxMagnitude: number }>();
      for (const r of rows) {
        if (!r.faultSlug || r.faultDistanceKm === null || r.faultDistanceKm > faultAssociationKm) continue;
        const b = byKey.get(r.faultSlug) ?? { label: r.faultName ?? r.faultSlug, count: 0, maxMagnitude: -Infinity };
        b.count += 1;
        b.maxMagnitude = Math.max(b.maxMagnitude, r.magnitude);
        byKey.set(r.faultSlug, b);
      }
      return [...byKey.entries()]
        .map(([key, b]) => ({ key, label: b.label, count: b.count, maxMagnitude: round2(b.maxMagnitude) }))
        .sort((a, b) => b.count - a.count);
    }
    case 'district': {
      const byKey = new Map<string, { label: string; count: number; maxMagnitude: number }>();
      for (const r of rows) {
        if (!r.districtSlug) continue;
        const b = byKey.get(r.districtSlug) ?? { label: r.districtName ?? r.districtSlug, count: 0, maxMagnitude: -Infinity };
        b.count += 1;
        b.maxMagnitude = Math.max(b.maxMagnitude, r.magnitude);
        byKey.set(r.districtSlug, b);
      }
      return [...byKey.entries()]
        .map(([key, b]) => ({ key, label: b.label, count: b.count, maxMagnitude: round2(b.maxMagnitude) }))
        .sort((a, b) => b.count - a.count);
    }
  }
}

export function dayBins(isoTimes: string[], fromMs: number, toMs: number): DistributionBin[] {
  const counts = new Map<string, number>();
  for (const t of isoTimes) {
    const day = istanbulDay(t);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const out: DistributionBin[] = [];
  for (let t = fromMs; t <= toMs; t += 86_400_000) {
    const day = istanbulDay(new Date(t).toISOString());
    if (!out.some((b) => b.key === day)) {
      out.push({ key: day, label: day.slice(8, 10) + '.' + day.slice(5, 7), count: counts.get(day) ?? 0 });
    }
  }
  return out;
}
