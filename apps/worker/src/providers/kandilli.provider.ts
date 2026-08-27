import { turkeyLocalToUtcIso } from '@ils/config';
import type { EarthquakeReport } from '@ils/types';
import type { EarthquakeProvider, ProviderOptions } from './types';
import { fetchWithTimeout } from './types';

/**
 * Kandilli Observatory (KOERI) adapter.
 * Primary upstream is the classic fixed-width text list (scripts/lst0.asp),
 * served as an HTML page in windows-1254. www.koeri.boun.edu.tr frequently
 * refuses connections from non-Turkish / cloud IP ranges, so the provider
 * falls back to KOERI's zeqmap XML feed on a different campus host
 * (udim.koeri.boun.edu.tr) before reporting the source as failed.
 * Times are Turkey local (UTC+3) in both feeds. There is no stable event id,
 * so a deterministic id is derived from time+coordinates; REVIZE lines produce
 * a new derived id and are re-attached to the same event by the duplicate
 * engine — the same mechanism also merges an event seen via both endpoints.
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

// Trailing solution-quality marker on locations: "İlksel" or "REVIZExx (…)"
const SOLUTION_MARKER_RE = /(İlksel|Ilksel|REVIZE\S*(\s*\([^)]*\))?)\s*$/i;

function stripSolutionMarker(location: string): string {
  const marker = SOLUTION_MARKER_RE.exec(location);
  return (marker ? location.slice(0, marker.index) : location).trim().replace(/\s{2,}/g, ' ');
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
    const location = stripSolutionMarker(rest);

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

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// The feed really does spell the tag "earhquake"; accept the corrected
// spelling too in case upstream ever fixes it.
const ZEQMAP_TAG_RE = /<\s*ea(?:rth|rh)quake\b([^>]*?)\/?\s*>/gi;
const ZEQMAP_TIME_RE = /^(\d{4})[./-](\d{2})[./-](\d{2})[\sT]+(\d{2}):(\d{2}):(\d{2})/;

/** Pure parser for KOERI's zeqmap XML feed (son24saat.xml) — unit tested against fixtures. */
export function parseKandilliZeqmapXml(xml: string, opts: KandilliParseOptions = {}): EarthquakeReport[] {
  const out: EarthquakeReport[] = [];
  for (const tag of xml.matchAll(ZEQMAP_TAG_RE)) {
    const attrs = new Map<string, string>();
    for (const attr of tag[1]!.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
      attrs.set(attr[1]!.toLowerCase(), decodeXmlEntities(attr[2]!));
    }
    const time = ZEQMAP_TIME_RE.exec(attrs.get('name') ?? '');
    if (!time) continue;
    const latS = attrs.get('lat') ?? '';
    const lonS = attrs.get('lng') ?? attrs.get('lon') ?? '';
    const latitude = Number(latS);
    const longitude = Number(lonS);
    if (latS === '' || lonS === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (opts.bbox) {
      const { minLat, maxLat, minLon, maxLon } = opts.bbox;
      if (latitude < minLat || latitude > maxLat || longitude < minLon || longitude > maxLon) continue;
    }
    const magnitude = mag(attrs.get('mag') ?? '');
    if (magnitude === null) continue;
    const depthKm = Number(attrs.get('depth') ?? '');
    const [, y, mo, d, h, mi, s] = time;
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
      // The feed publishes a single preferred magnitude, ML in KOERI's list.
      magnitudeType: 'ML',
      location: stripSolutionMarker(attrs.get('lokasyon') ?? ''),
      dataClass: 'live',
      rawPayload: { tag: tag[0]! },
    });
  }
  return out;
}

/** Same data, different campus host — used when www.koeri.boun.edu.tr is unreachable. */
const KANDILLI_FALLBACK_URLS = [
  'https://udim.koeri.boun.edu.tr/zeqmap/xmlt/son24saat.xml',
  'http://udim.koeri.boun.edu.tr/zeqmap/xmlt/son24saat.xml',
];

function isZeqmapUrl(url: string): boolean {
  return /zeqmap|\.xml(\?|$)/i.test(url);
}

function shortError(err: unknown): string {
  let cur: unknown = err;
  for (let i = 0; cur !== null && typeof cur === 'object' && i < 4; i += 1) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && code !== '') return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 80 ? `${msg.slice(0, 77)}…` : msg;
}

function sniffDecode(buffer: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 160));
  const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1];
  const label = declared && /utf-?8/i.test(declared) ? 'utf-8' : 'windows-1254';
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return new TextDecoder('latin1').decode(buffer);
  }
}

export class KandilliProvider implements EarthquakeProvider {
  readonly id = 'KANDILLI' as const;
  readonly name = 'KANDİLLİ';

  constructor(
    private url: string,
    private opts: ProviderOptions,
  ) {}

  async getLatestEarthquakes(): Promise<EarthquakeReport[]> {
    const candidates = [this.url, ...KANDILLI_FALLBACK_URLS.filter((u) => u !== this.url)];
    const failures: string[] = [];
    for (const url of candidates) {
      let reports: EarthquakeReport[];
      try {
        const res = await fetchWithTimeout(url, this.opts.timeoutMs);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = sniffDecode(await res.arrayBuffer());
        reports = isZeqmapUrl(url)
          ? parseKandilliZeqmapXml(text, { bbox: this.opts.bbox })
          : parseKandilliText(text, { bbox: this.opts.bbox });
      } catch (err) {
        const u = new URL(url);
        failures.push(`${u.protocol}//${u.host} (${shortError(err)})`);
        continue;
      }
      const cutoff = Date.now() - this.opts.windowMs;
      return reports.filter((r) => Date.parse(r.occurredAt) >= cutoff);
    }
    throw new Error(`all KANDILLI endpoints failed: ${failures.join(' | ')}`);
  }
}
