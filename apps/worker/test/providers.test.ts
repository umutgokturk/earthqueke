import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afadDateToIso, parseAfadPayload } from '../src/providers/afad.provider';
import {
  KandilliProvider,
  parseKandilliText,
  parseKandilliZeqmapXml,
} from '../src/providers/kandilli.provider';
import { MockProvider } from '../src/providers/mock.provider';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('AFAD provider parser', () => {
  const payload = JSON.parse(readFileSync(path.join(fixtures, 'afad-sample.json'), 'utf8'));

  it('normalizes valid events and skips broken ones', () => {
    const reports = parseAfadPayload(payload);
    expect(reports).toHaveLength(2);
    const first = reports[0]!;
    expect(first.source).toBe('AFAD');
    expect(first.sourceEventId).toBe('648744');
    expect(first.latitude).toBeCloseTo(40.8123);
    expect(first.longitude).toBeCloseTo(28.1234);
    expect(first.depthKm).toBeCloseTo(12.4);
    expect(first.magnitude).toBeCloseTo(2.1);
    expect(first.magnitudeType).toBe('ML');
    expect(first.location).toContain('Silivri');
    expect(first.dataClass).toBe('live');
  });

  it('treats zone-less dates as UTC and keeps explicit zones', () => {
    expect(afadDateToIso('2026-08-27T09:15:30')).toBe('2026-08-27T09:15:30.000Z');
    expect(afadDateToIso('2026-08-27T10:02:11Z')).toBe('2026-08-27T10:02:11.000Z');
    const reports = parseAfadPayload(payload);
    expect(reports[0]!.occurredAt).toBe('2026-08-27T09:15:30.000Z');
  });

  it('accepts numeric fields both as strings and numbers', () => {
    const second = parseAfadPayload(payload)[1]!;
    expect(second.sourceEventId).toBe('648750');
    expect(second.magnitude).toBeCloseTo(3.4);
    expect(second.depthKm).toBeCloseTo(7.9);
  });

  it('returns empty array for non-array payloads', () => {
    expect(parseAfadPayload({ error: 'oops' })).toEqual([]);
    expect(parseAfadPayload(null)).toEqual([]);
  });
});

describe('Kandilli provider parser', () => {
  const html = readFileSync(path.join(fixtures, 'kandilli-sample.html'), 'utf8');

  it('parses fixed-width rows inside <pre> and skips garbage', () => {
    const reports = parseKandilliText(html);
    expect(reports).toHaveLength(4);
    const first = reports[0]!;
    expect(first.source).toBe('KANDILLI');
    expect(first.latitude).toBeCloseTo(40.812);
    expect(first.magnitude).toBeCloseTo(2.0);
    expect(first.magnitudeType).toBe('ML');
    expect(first.location).toBe('MARMARA DENIZI - SILIVRI ACIKLARI (ISTANBUL)');
  });

  it('converts Turkey local time (UTC+3) to UTC', () => {
    const first = parseKandilliText(html)[0]!;
    expect(first.occurredAt).toBe('2026-08-27T09:15:30.000Z');
  });

  it('strips REVIZE markers and prefers ML over Mw over MD', () => {
    const reports = parseKandilliText(html);
    const revised = reports[1]!;
    expect(revised.location).toBe('ADALAR ACIKLARI (MARMARA DENIZI)');
    expect(revised.magnitude).toBeCloseTo(3.3); // ML preferred over Mw 3.4
    const mdOnly = reports[3]!;
    expect(mdOnly.magnitude).toBeCloseTo(2.1);
    expect(mdOnly.magnitudeType).toBe('MD');
  });

  it('applies the bbox filter (drops the Aegean event)', () => {
    const reports = parseKandilliText(html, {
      bbox: { minLat: 39.8, maxLat: 41.6, minLon: 26.0, maxLon: 30.5 },
    });
    expect(reports).toHaveLength(3);
    expect(reports.every((r) => r.latitude >= 39.8)).toBe(true);
  });

  it('derives a deterministic sourceEventId from time and coordinates', () => {
    const [a] = parseKandilliText(html);
    const [b] = parseKandilliText(html);
    expect(a!.sourceEventId).toBe(b!.sourceEventId);
    expect(a!.sourceEventId).toMatch(/^koeri-\d{14}-/);
  });
});

describe('Kandilli zeqmap XML parser (yedek uç nokta)', () => {
  const xml = readFileSync(path.join(fixtures, 'kandilli-zeqmap-sample.xml'), 'utf8');

  it('parses attribute rows, decodes entities and skips broken ones', () => {
    const reports = parseKandilliZeqmapXml(xml);
    expect(reports).toHaveLength(3);
    const first = reports[0]!;
    expect(first.source).toBe('KANDILLI');
    expect(first.latitude).toBeCloseTo(40.812);
    expect(first.magnitude).toBeCloseTo(2.0);
    expect(first.magnitudeType).toBe('ML');
    expect(first.depthKm).toBeCloseTo(12.4);
    expect(first.location).toBe('MARMARA DENIZI - SILIVRI ACIKLARI (ISTANBUL)');
    expect(first.dataClass).toBe('live');
  });

  it('converts Turkey local time (UTC+3) to UTC', () => {
    expect(parseKandilliZeqmapXml(xml)[0]!.occurredAt).toBe('2026-08-27T09:15:30.000Z');
  });

  it('strips REVIZE markers from locations', () => {
    expect(parseKandilliZeqmapXml(xml)[1]!.location).toBe('ADALAR ACIKLARI (MARMARA DENIZI)');
  });

  it('applies the bbox filter (drops the Aegean event)', () => {
    const reports = parseKandilliZeqmapXml(xml, {
      bbox: { minLat: 39.8, maxLat: 41.6, minLon: 26.0, maxLon: 30.5 },
    });
    expect(reports).toHaveLength(2);
  });

  it('derives the same deterministic id scheme as the lst0 parser', () => {
    expect(parseKandilliZeqmapXml(xml)[0]!.sourceEventId).toBe('koeri-20260827121530-40.8120-28.1230');
  });
});

describe('Kandilli provider endpoint failover', () => {
  const opts = {
    bbox: { minLat: 39.8, maxLat: 41.6, minLon: 26.0, maxLon: 30.5 },
    windowMs: 6 * 60 * 60 * 1000,
    timeoutMs: 5000,
  };
  const PRIMARY = 'https://www.koeri.boun.edu.tr/scripts/lst0.asp';

  function connectTimeoutError(): Error {
    const err = new TypeError('fetch failed');
    (err as Error & { cause?: unknown }).cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
    return err;
  }

  function freshXml(): string {
    const t = new Date(Date.now() + 3 * 60 * 60 * 1000 - 60_000); // 1 dk önce, TR yerel saati
    const p = (n: number) => String(n).padStart(2, '0');
    const name = `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(
      t.getUTCHours(),
    )}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
    return `<?xml version="1.0" encoding="UTF-8"?><eqlist><earhquake name="${name}" lokasyon="MARMARA DENIZI &#304;lksel" lat="40.8500" lng="28.4000" mag="2.2" Depth="8.0" /></eqlist>`;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the udim zeqmap feed when www.koeri is unreachable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectTimeoutError())
      .mockResolvedValueOnce(new Response(freshXml(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new KandilliProvider(PRIMARY, opts);
    const reports = await provider.getLatestEarthquakes();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.source).toBe('KANDILLI');
    expect(reports[0]!.location).toBe('MARMARA DENIZI');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('udim.koeri.boun.edu.tr');
  });

  it('reports every failed endpoint when all of them are down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(connectTimeoutError()));
    const provider = new KandilliProvider(PRIMARY, opts);
    await expect(provider.getLatestEarthquakes()).rejects.toThrow(
      /www\.koeri\.boun\.edu\.tr \(UND_ERR_CONNECT_TIMEOUT\).*udim\.koeri\.boun\.edu\.tr/,
    );
  });

  it('surfaces upstream HTTP errors per endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('erisim engellendi', { status: 403 })),
    );
    const provider = new KandilliProvider(PRIMARY, opts);
    await expect(provider.getLatestEarthquakes()).rejects.toThrow(/HTTP 403/);
  });
});

describe('Mock provider', () => {
  it('refuses to run in production', () => {
    expect(() => new MockProvider('production')).toThrow(/production/);
  });

  it('labels every emitted report as MOCK synthetic data', async () => {
    const provider = new MockProvider('development', { seed: 7 });
    provider.queueImmediateEvent();
    const reports = await provider.getLatestEarthquakes();
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      expect(r.source).toBe('MOCK');
      expect(r.dataClass).toBe('mock');
    }
  });
});
