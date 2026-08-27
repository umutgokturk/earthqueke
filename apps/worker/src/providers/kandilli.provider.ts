import { turkeyLocalToUtcIso } from '@ils/config';
import type { EarthquakeReport } from '@ils/types';
import type { EarthquakeProvider, ProviderOptions } from './types';
import { fetchWithTimeout } from './types';

/**
 * Kandilli Observatory (KOERI) adapter.
 * Upstream is the classic fixed-width text list (scripts/lst0.asp), served as
 * an HTML page in windows-1254. Times are Turkey local (UTC+3). There is no
 * stable event id, so a deterministic id is derived from time+coordinates;
 * REVIZE lines produce a new derived id and are re-attached to the same event
 * by the duplicate engine.
 * Attribution: Boğaziçi Üniversitesi Kandilli Rasathanesi ve DAE (RETMC).
 */

const LINE_RE =
  /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/;

function mag(v: string): number | null {
  if (v === '-.-' || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface KandilliParseOptions {
  bbox?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

/** Pure parser for the lst0.asp text body — unit tested against fixtures. */
export function parseKandilliText(text: string, opts: KandilliParseOptions = {}): EarthquakeReport[] {
  // The list lives inside a <pre> block; when absent (raw text) use everything.
  const preMatch = /<pre>([\s\S]*?)<\/pre>/i.exec(text);
  const body = preMatch ? preMatch[1]! : text;
  const out: EarthquakeReport[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const m = LINE_RE.exec(line.trim());
    if (!m) continue;
    const [, y, mo, d, h, mi, s, latS, lonS, depthS, mdS, mlS, mwS] = m;
    const rest = m[13]!;
    const latitude = Number(latS);
    const longitude = Number(lonS);
    const depthKm = Number(depthS);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (opts.bbox) {
      const { minLat, maxLat, minLon, maxLon } = opts.bbox;
      if (latitude < minLat || latitude > maxLat || longitude < minLon || longitude > maxLon) continue;
    }
    const md = mag(mdS!);
    const ml = mag(mlS!);
    const mw = mag(mwS!);
    const magnitude = ml ?? mw ?? md;
    if (magnitude === null) continue;
    const magnitudeType = ml !== null ? 'ML' : mw !== null ? 'Mw' : 'MD';

    // Trailing solution-quality marker: "İlksel" or "REVIZExx (…)"
    const revize = /(İlksel|Ilksel|REVIZE\S*(\s*\([^)]*\))?)\s*$/i.exec(rest);
    const location = (revize ? rest.slice(0, revize.index) : rest).trim().replace(/\s{2,}/g, ' ');

    const occurredAt = turkeyLocalToUtcIso(
      Number(y),
      Number(mo),
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    );
    const sourceEventId = `koeri-${y}${mo}${d}${h}${mi}${s}-${latS}-${lonS}`;
    out.push({
      id: sourceEventId,
      source: 'KANDILLI',
      sourceEventId,
      occurredAt,
      latitude,
      longitude,
      depthKm: Number.isFinite(depthKm) ? depthKm : 0,
      magnitude,
      magnitudeType,
      location,
      dataClass: 'live',
      rawPayload: { line: line.trim() },
    });
  }
  return out;
}

export class KandilliProvider implements EarthquakeProvider {
  readonly id = 'KANDILLI' as const;
  readonly name = 'KANDİLLİ';

  constructor(
    private url: string,
    private opts: ProviderOptions,
  ) {}

  async getLatestEarthquakes(): Promise<EarthquakeReport[]> {
    const res = await fetchWithTimeout(this.url, this.opts.timeoutMs);
    if (!res.ok) {
      throw new Error(`KANDILLI HTTP ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder('windows-1254').decode(buffer);
    } catch {
      text = new TextDecoder('latin1').decode(buffer);
    }
    const cutoff = Date.now() - this.opts.windowMs;
    return parseKandilliText(text, { bbox: this.opts.bbox }).filter(
      (r) => Date.parse(r.occurredAt) >= cutoff,
    );
  }
}
