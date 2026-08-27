import type { PolygonGeometry, RegionKind } from '@ils/types';

/**
 * ⚠️ VERİ NOTU / DATA NOTE
 * The polygons and district centroids below are COARSE, HAND-SIMPLIFIED
 * approximations intended only for approximate spatial classification and
 * visualization. They are NOT official administrative boundaries and are
 * flagged `approximate: true` everywhere they surface. For authoritative
 * boundaries import official GeoJSON (e.g. İBB Açık Veri Portalı,
 * data.ibb.gov.tr) through the admin panel.
 */

export interface RegionSeed {
  slug: string;
  name: string;
  kind: RegionKind;
  geometry: PolygonGeometry | null;
  centroid: { latitude: number; longitude: number };
  radiusKm: number | null;
  approximate: boolean;
  source: string;
}

const polygon = (ring: [number, number][]): PolygonGeometry => ({
  type: 'Polygon',
  coordinates: [[...ring, ring[0]!] as [number, number][]],
});

/** Coarse Istanbul province land outline (both sides of the Bosphorus). */
export const ISTANBUL_POLYGON: PolygonGeometry = polygon([
  [27.98, 41.06],
  [28.25, 41.08],
  [28.55, 41.02],
  [28.7, 40.97],
  [28.87, 40.955],
  [29.0, 41.0],
  [29.05, 40.95],
  [29.16, 40.895],
  [29.3, 40.85],
  [29.42, 40.81],
  [29.6, 40.86],
  [29.95, 40.86],
  [29.95, 41.22],
  [29.3, 41.24],
  [29.1, 41.26],
  [28.9, 41.34],
  [28.4, 41.36],
  [28.05, 41.46],
  [27.97, 41.3],
]);

/** Coarse Marmara Sea outline. */
export const MARMARA_SEA_POLYGON: PolygonGeometry = polygon([
  [26.7, 40.38],
  [27.1, 40.42],
  [27.5, 40.36],
  [28.0, 40.37],
  [28.8, 40.35],
  [29.1, 40.4],
  [29.48, 40.7],
  [29.35, 40.77],
  [29.12, 40.86],
  [28.98, 40.94],
  [28.85, 40.94],
  [28.6, 40.99],
  [28.2, 41.05],
  [27.6, 40.99],
  [27.3, 40.93],
  [26.9, 40.72],
  [26.68, 40.52],
]);

const REGION_SOURCE =
  'Elle basitleştirilmiş yaklaşık geometri (resmi sınır değildir) — resmi veri: İBB Açık Veri Portalı / HGM';

/** District centroids (approximate) for all 39 Istanbul districts. */
const DISTRICTS: Array<{ slug: string; name: string; lat: number; lon: number; r: number }> = [
  { slug: 'adalar', name: 'Adalar', lat: 40.87, lon: 29.09, r: 7 },
  { slug: 'arnavutkoy', name: 'Arnavutköy', lat: 41.18, lon: 28.74, r: 14 },
  { slug: 'atasehir', name: 'Ataşehir', lat: 40.98, lon: 29.11, r: 5 },
  { slug: 'avcilar', name: 'Avcılar', lat: 40.98, lon: 28.72, r: 6 },
  { slug: 'bagcilar', name: 'Bağcılar', lat: 41.04, lon: 28.86, r: 4 },
  { slug: 'bahcelievler', name: 'Bahçelievler', lat: 41.0, lon: 28.85, r: 4 },
  { slug: 'bakirkoy', name: 'Bakırköy', lat: 40.98, lon: 28.87, r: 5 },
  { slug: 'basaksehir', name: 'Başakşehir', lat: 41.09, lon: 28.8, r: 8 },
  { slug: 'bayrampasa', name: 'Bayrampaşa', lat: 41.04, lon: 28.9, r: 3.5 },
  { slug: 'besiktas', name: 'Beşiktaş', lat: 41.05, lon: 29.01, r: 4.5 },
  { slug: 'beykoz', name: 'Beykoz', lat: 41.13, lon: 29.1, r: 13 },
  { slug: 'beylikduzu', name: 'Beylikdüzü', lat: 41.0, lon: 28.64, r: 6 },
  { slug: 'beyoglu', name: 'Beyoğlu', lat: 41.03, lon: 28.97, r: 3.5 },
  { slug: 'buyukcekmece', name: 'Büyükçekmece', lat: 41.02, lon: 28.58, r: 9 },
  { slug: 'catalca', name: 'Çatalca', lat: 41.14, lon: 28.46, r: 18 },
  { slug: 'cekmekoy', name: 'Çekmeköy', lat: 41.04, lon: 29.18, r: 8 },
  { slug: 'esenler', name: 'Esenler', lat: 41.04, lon: 28.88, r: 4 },
  { slug: 'esenyurt', name: 'Esenyurt', lat: 41.03, lon: 28.67, r: 5 },
  { slug: 'eyupsultan', name: 'Eyüpsultan', lat: 41.08, lon: 28.92, r: 10 },
  { slug: 'fatih', name: 'Fatih', lat: 41.01, lon: 28.94, r: 4 },
  { slug: 'gaziosmanpasa', name: 'Gaziosmanpaşa', lat: 41.06, lon: 28.91, r: 4 },
  { slug: 'gungoren', name: 'Güngören', lat: 41.02, lon: 28.87, r: 3 },
  { slug: 'kadikoy', name: 'Kadıköy', lat: 40.98, lon: 29.04, r: 5.5 },
  { slug: 'kagithane', name: 'Kağıthane', lat: 41.07, lon: 28.97, r: 4.5 },
  { slug: 'kartal', name: 'Kartal', lat: 40.9, lon: 29.19, r: 6 },
  { slug: 'kucukcekmece', name: 'Küçükçekmece', lat: 41.0, lon: 28.77, r: 6 },
  { slug: 'maltepe', name: 'Maltepe', lat: 40.93, lon: 29.13, r: 6 },
  { slug: 'pendik', name: 'Pendik', lat: 40.88, lon: 29.25, r: 9 },
  { slug: 'sancaktepe', name: 'Sancaktepe', lat: 40.99, lon: 29.23, r: 6 },
  { slug: 'sariyer', name: 'Sarıyer', lat: 41.17, lon: 29.05, r: 11 },
  { slug: 'sile', name: 'Şile', lat: 41.17, lon: 29.61, r: 22 },
  { slug: 'silivri', name: 'Silivri', lat: 41.08, lon: 28.25, r: 16 },
  { slug: 'sisli', name: 'Şişli', lat: 41.06, lon: 28.98, r: 4 },
  { slug: 'sultanbeyli', name: 'Sultanbeyli', lat: 40.96, lon: 29.27, r: 5 },
  { slug: 'sultangazi', name: 'Sultangazi', lat: 41.1, lon: 28.87, r: 5 },
  { slug: 'tuzla', name: 'Tuzla', lat: 40.83, lon: 29.3, r: 8 },
  { slug: 'umraniye', name: 'Ümraniye', lat: 41.02, lon: 29.1, r: 5.5 },
  { slug: 'uskudar', name: 'Üsküdar', lat: 41.03, lon: 29.03, r: 5 },
  { slug: 'zeytinburnu', name: 'Zeytinburnu', lat: 40.99, lon: 28.9, r: 3.5 },
];

export const REGION_SEEDS: RegionSeed[] = [
  {
    slug: 'istanbul',
    name: 'İstanbul',
    kind: 'city',
    geometry: ISTANBUL_POLYGON,
    centroid: { latitude: 41.0082, longitude: 28.9784 },
    radiusKm: null,
    approximate: true,
    source: REGION_SOURCE,
  },
  {
    slug: 'marmara',
    name: 'Marmara Denizi',
    kind: 'sea',
    geometry: MARMARA_SEA_POLYGON,
    centroid: { latitude: 40.72, longitude: 28.2 },
    radiusKm: null,
    approximate: true,
    source: REGION_SOURCE,
  },
  ...DISTRICTS.map(
    (d): RegionSeed => ({
      slug: d.slug,
      name: d.name,
      kind: 'district',
      geometry: null,
      centroid: { latitude: d.lat, longitude: d.lon },
      radiusKm: d.r,
      approximate: true,
      source: REGION_SOURCE,
    }),
  ),
];

export const DISTRICT_SEEDS = REGION_SEEDS.filter((r) => r.kind === 'district');

/**
 * Assign a district by nearest centroid within its approximate radius.
 * Returns null when the point is not close to any district centroid.
 */
export function classifyDistrict(
  lat: number,
  lon: number,
  distanceKm: (aLat: number, aLon: number, bLat: number, bLon: number) => number,
): RegionSeed | null {
  let best: RegionSeed | null = null;
  let bestD = Infinity;
  for (const d of DISTRICT_SEEDS) {
    const dist = distanceKm(lat, lon, d.centroid.latitude, d.centroid.longitude);
    if (d.radiusKm !== null && dist <= d.radiusKm && dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}
