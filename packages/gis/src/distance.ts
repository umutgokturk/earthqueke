import type { Position } from '@ils/types';

const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance from a point to a polyline (array of [lon, lat] positions), km.
 * Uses a local equirectangular projection around the query point, then exact
 * point-to-segment projection. Accurate to well under 1% at Marmara scale.
 * (The PostGIS store uses ST_Distance on geography instead; this is the
 * in-memory fallback and the shared unit-testable reference implementation.)
 */
export function pointToPolylineKm(lat: number, lon: number, line: Position[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) {
    const p = line[0]!;
    return haversineKm(lat, lon, p[1], p[0]);
  }
  const cosLat = Math.cos(toRad(lat));
  const px = 0;
  const py = 0;
  const toXY = (pos: Position): [number, number] => [
    toRad(pos[0] - lon) * cosLat * EARTH_RADIUS_KM,
    toRad(pos[1] - lat) * EARTH_RADIUS_KM,
  ];

  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toXY(line[i]!);
    const [bx, by] = toXY(line[i + 1]!);
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    let t = 0;
    if (lenSq > 0) {
      t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
  }
  return best;
}

export function pointToMultiLineKm(lat: number, lon: number, lines: Position[][]): number {
  let best = Infinity;
  for (const line of lines) {
    const d = pointToPolylineKm(lat, lon, line);
    if (d < best) best = d;
  }
  return best;
}
