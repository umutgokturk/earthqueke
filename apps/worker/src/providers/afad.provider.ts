import type { EarthquakeReport } from '@ils/types';
import type { EarthquakeProvider, ProviderOptions } from './types';
import { fetchWithTimeout } from './types';

/**
 * AFAD event API adapter (https://deprem.afad.gov.tr/apiv2).
 * GET {base}/event/filter?start=…&end=…&minlat=…&… returns a JSON array.
 * Numeric fields arrive as strings; `date` is UTC without a zone designator.
 * Attribution: T.C. İçişleri Bakanlığı AFAD.
 */

export interface AfadRawEvent {
  eventID?: string | number;
  id?: string | number;
  date?: string;
  latitude?: string | number;
  longitude?: string | number;
  depth?: string | number;
  magnitude?: string | number;
  type?: string;
  location?: string;
  province?: string | null;
  district?: string | null;
  country?: string | null;
  [key: string]: unknown;
}

function toNumber(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** AFAD publishes `date` in UTC without a zone suffix — force UTC parsing. */
export function afadDateToIso(date: string): string | null {
  const trimmed = date.trim();
  if (!trimmed) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const ms = Date.parse(hasZone ? trimmed : `${trimmed}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Pure parser — unit tested against fixture payloads. */
export function parseAfadPayload(payload: unknown): EarthquakeReport[] {
  if (!Array.isArray(payload)) return [];
  const out: EarthquakeReport[] = [];
  for (const raw of payload as AfadRawEvent[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const eventId = raw.eventID ?? raw.id;
    const latitude = toNumber(raw.latitude);
    const longitude = toNumber(raw.longitude);
    const magnitude = toNumber(raw.magnitude);
    const depthKm = toNumber(raw.depth);
    const occurredAt = raw.date ? afadDateToIso(raw.date) : null;
    if (eventId === undefined || latitude === null || longitude === null || magnitude === null || occurredAt === null) {
      continue;
    }
    const locationParts = [raw.location, raw.province && raw.location?.includes(String(raw.province)) ? null : raw.province]
      .filter((p): p is string => typeof p === 'string' && p.trim() !== '');
    out.push({
      id: `afad-${eventId}`,
      source: 'AFAD',
      sourceEventId: String(eventId),
      occurredAt,
      latitude,
      longitude,
      depthKm: depthKm ?? 0,
      magnitude,
      magnitudeType: typeof raw.type === 'string' && raw.type.trim() !== '' ? raw.type.trim() : undefined,
      location: locationParts.join(' - ') || 'Bilinmeyen konum',
      dataClass: 'live',
      rawPayload: raw,
    });
  }
  return out;
}

function fmt(ts: number): string {
  // AFAD expects "YYYY-MM-DD HH:mm:ss" (UTC)
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

export class AfadProvider implements EarthquakeProvider {
  readonly id = 'AFAD' as const;
  readonly name = 'AFAD';

  constructor(
    private baseUrl: string,
    private opts: ProviderOptions,
  ) {}

  async getLatestEarthquakes(): Promise<EarthquakeReport[]> {
    const now = Date.now();
    const params = new URLSearchParams({
      start: fmt(now - this.opts.windowMs),
      end: fmt(now + 60_000),
      minlat: String(this.opts.bbox.minLat),
      maxlat: String(this.opts.bbox.maxLat),
      minlon: String(this.opts.bbox.minLon),
      maxlon: String(this.opts.bbox.maxLon),
      orderby: 'timedesc',
    });
    const url = `${this.baseUrl.replace(/\/$/, '')}/event/filter?${params.toString()}`;
    const res = await fetchWithTimeout(url, this.opts.timeoutMs, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`AFAD HTTP ${res.status}`);
    }
    const payload: unknown = await res.json();
    return parseAfadPayload(payload);
  }
}
