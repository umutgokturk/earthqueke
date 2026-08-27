import type { DataClass, EarthquakeReport, Position } from '@ils/types';
import { FAULT_SEEDS } from '@ils/gis';

/**
 * Synthetic data generator — development & seed use only.
 * Every report it produces is labelled with dataClass 'seed' or 'mock' and
 * source 'MOCK'; the UI must render these with a DEVELOPMENT DATA badge and
 * they are excluded from production responses.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SegmentSource {
  slug: string;
  line: Position[];
  weight: number;
  location: string;
}

const SEGMENT_SOURCES: SegmentSource[] = [
  { slug: 'adalar-segmenti', weight: 0.28, location: 'Marmara Denizi - Adalar Açıkları (İstanbul)', line: [] },
  { slug: 'kumburgaz-segmenti', weight: 0.22, location: 'Marmara Denizi - Silivri Açıkları (İstanbul)', line: [] },
  { slug: 'orta-marmara-segmenti', weight: 0.18, location: 'Marmara Denizi - Marmara Ereğlisi Açıkları (Tekirdağ)', line: [] },
  { slug: 'tekirdag-segmenti', weight: 0.17, location: 'Marmara Denizi - Tekirdağ Açıkları', line: [] },
  { slug: 'cinarcik-segmenti', weight: 0.15, location: 'Marmara Denizi - Çınarcık Açıkları (Yalova)', line: [] },
];

for (const s of SEGMENT_SOURCES) {
  const seed = FAULT_SEEDS.find((f) => f.slug === s.slug);
  if (seed && seed.geometry.type === 'LineString') s.line = seed.geometry.coordinates;
}

function pickSegment(rng: () => number): SegmentSource {
  const r = rng();
  let acc = 0;
  for (const s of SEGMENT_SOURCES) {
    acc += s.weight;
    if (r <= acc) return s;
  }
  return SEGMENT_SOURCES[0]!;
}

/** Gutenberg–Richter-like magnitude sample (b≈1), floored at 1.0, capped. */
function sampleMagnitude(rng: () => number, cap = 5.4): number {
  const u = Math.max(rng(), 1e-6);
  const m = 1.0 - Math.log10(u);
  return Math.round(Math.min(m, cap) * 10) / 10;
}

function samplePointOnSegment(seg: SegmentSource, rng: () => number): { lat: number; lon: number } {
  const line = seg.line;
  if (line.length < 2) return { lat: 40.85, lon: 28.8 };
  const i = Math.min(line.length - 2, Math.floor(rng() * (line.length - 1)));
  const t = rng();
  const [x1, y1] = line[i]!;
  const [x2, y2] = line[i + 1]!;
  const jitterLat = (rng() - 0.5) * 0.08;
  const jitterLon = (rng() - 0.5) * 0.1;
  return { lat: y1 + (y2 - y1) * t + jitterLat, lon: x1 + (x2 - x1) * t + jitterLon };
}

export interface SyntheticOptions {
  /** History length in days (generated backwards from `now`). */
  days: number;
  now?: number;
  /** Average events per day. */
  ratePerDay?: number;
  seed?: number;
  dataClass?: DataClass;
  idPrefix?: string;
}

export function generateSyntheticReport(
  rng: () => number,
  atMs: number,
  index: number,
  dataClass: DataClass,
  idPrefix: string,
): EarthquakeReport {
  const seg = pickSegment(rng);
  const { lat, lon } = samplePointOnSegment(seg, rng);
  const magnitude = sampleMagnitude(rng);
  const depthKm = Math.round((3 + rng() * 12 + rng() * 4) * 10) / 10;
  const id = `${idPrefix}-${atMs}-${index}`;
  return {
    id,
    source: 'MOCK',
    sourceEventId: id,
    occurredAt: new Date(atMs).toISOString(),
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lon * 1e6) / 1e6,
    depthKm,
    magnitude,
    magnitudeType: 'ML',
    location: seg.location,
    dataClass,
    rawPayload: { synthetic: true, origin: dataClass === 'seed' ? 'seed/development' : 'mock-provider' },
  };
}

/** Generate a labelled synthetic history (development seeding). */
export function generateSyntheticHistory(opts: SyntheticOptions): EarthquakeReport[] {
  const now = opts.now ?? Date.now();
  const rng = mulberry32(opts.seed ?? 421997);
  const ratePerDay = opts.ratePerDay ?? 35;
  const meanGapMs = 86_400_000 / ratePerDay;
  const horizon = now - opts.days * 86_400_000;
  const out: EarthquakeReport[] = [];
  let t = now - rng() * meanGapMs;
  let i = 0;
  while (t > horizon) {
    out.push(generateSyntheticReport(rng, Math.round(t), i, opts.dataClass ?? 'seed', opts.idPrefix ?? 'seed'));
    // exponential inter-arrival gaps; occasional burst tightens the gap
    const burst = rng() < 0.08 ? 0.2 : 1;
    t -= -Math.log(Math.max(rng(), 1e-9)) * meanGapMs * burst;
    i += 1;
  }
  return out.reverse();
}
