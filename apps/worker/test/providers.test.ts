import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { afadDateToIso, parseAfadPayload } from '../src/providers/afad.provider';
import { parseKandilliText } from '../src/providers/kandilli.provider';
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
