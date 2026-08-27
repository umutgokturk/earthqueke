import type { PolygonGeometry, Position } from '@ils/types';

/**
 * Ray-casting point-in-polygon on the outer ring (holes unsupported — our
 * region polygons have none). Matches PostGIS ST_Within semantics closely
 * enough for the coarse, explicitly-approximate region polygons we ship.
 */
export function pointInRing(lat: number, lon: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lat: number, lon: number, polygon: PolygonGeometry): boolean {
  const outer = polygon.coordinates[0];
  if (!outer || outer.length < 4) return false;
  return pointInRing(lat, lon, outer);
}

export function polygonBbox(polygon: PolygonGeometry): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const ring of polygon.coordinates) {
    for (const [x, y] of ring) {
      if (y < minLat) minLat = y;
      if (y > maxLat) maxLat = y;
      if (x < minLon) minLon = x;
      if (x > maxLon) maxLon = x;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}
