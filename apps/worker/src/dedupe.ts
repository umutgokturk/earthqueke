import { haversineKm } from '@ils/gis';
import type { Earthquake, EarthquakeReport } from '@ils/types';

/**
 * Duplicate detection (spec §18): AFAD and Kandilli report the same physical
 * event with different ids. A report matches an existing canonical event when
 *   |Δt| ≤ timeSeconds  AND  distance ≤ distanceKm  AND  |Δmag| ≤ magnitudeDelta.
 * Neither source is discarded — the engine attaches the report to the matched
 * event so it carries every source (sources: [AFAD, KANDILLI]).
 */
export interface DedupeConfig {
  timeSeconds: number;
  distanceKm: number;
  magnitudeDelta: number;
}

export interface MatchScore {
  event: Earthquake;
  score: number;
  deltaSeconds: number;
  distanceKm: number;
  deltaMagnitude: number;
}

export function scoreMatch(report: EarthquakeReport, event: Earthquake, cfg: DedupeConfig): MatchScore | null {
  const deltaSeconds = Math.abs(Date.parse(report.occurredAt) - Date.parse(event.occurredAt)) / 1000;
  if (deltaSeconds > cfg.timeSeconds) return null;
  const distanceKm = haversineKm(report.latitude, report.longitude, event.latitude, event.longitude);
  if (distanceKm > cfg.distanceKm) return null;
  const deltaMagnitude = Math.abs(report.magnitude - event.magnitude);
  if (deltaMagnitude > cfg.magnitudeDelta) return null;
  const score =
    deltaSeconds / cfg.timeSeconds + distanceKm / cfg.distanceKm + deltaMagnitude / cfg.magnitudeDelta;
  return { event, score, deltaSeconds, distanceKm, deltaMagnitude };
}

/** Best-matching candidate for a report, or null when nothing qualifies. */
export function findMatch(
  report: EarthquakeReport,
  candidates: Earthquake[],
  cfg: DedupeConfig,
): Earthquake | null {
  let best: MatchScore | null = null;
  for (const candidate of candidates) {
    const match = scoreMatch(report, candidate, cfg);
    if (match && (best === null || match.score < best.score)) best = match;
  }
  return best?.event ?? null;
}
