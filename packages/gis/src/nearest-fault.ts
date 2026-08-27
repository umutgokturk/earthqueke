import type { LineStringGeometry, MultiLineStringGeometry } from '@ils/types';
import { pointToMultiLineKm, pointToPolylineKm } from './distance';

export interface FaultLike {
  id?: string;
  slug: string;
  name: string;
  isZone: boolean;
  geometry: LineStringGeometry | MultiLineStringGeometry;
}

export function distanceToFaultKm(lat: number, lon: number, fault: FaultLike): number {
  return fault.geometry.type === 'LineString'
    ? pointToPolylineKm(lat, lon, fault.geometry.coordinates)
    : pointToMultiLineKm(lat, lon, fault.geometry.coordinates);
}

/**
 * Nearest non-zone fault segment to a point. Zones (aggregate traces) are
 * excluded so an event is attributed to exactly one atomic segment.
 */
export function nearestFault<T extends FaultLike>(
  lat: number,
  lon: number,
  faults: T[],
): { fault: T; distanceKm: number } | null {
  let best: { fault: T; distanceKm: number } | null = null;
  for (const f of faults) {
    if (f.isZone) continue;
    const d = distanceToFaultKm(lat, lon, f);
    if (!best || d < best.distanceKm) best = { fault: f, distanceKm: d };
  }
  return best;
}
