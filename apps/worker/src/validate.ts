import { z } from 'zod';
import type { EarthquakeReport } from '@ils/types';

/**
 * Incoming-data validation (spec §26): invalid reports never reach the
 * database. Bounds: lat −90..90, lon −180..180, depth ≥ 0, magnitude ≥ 0,
 * occurredAt a real date that is not in the (non-trivial) future.
 */
const ReportSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['AFAD', 'KANDILLI', 'MOCK', 'OTHER']),
  sourceEventId: z.string().min(1).optional(),
  occurredAt: z.string().refine((v) => Number.isFinite(Date.parse(v)), 'invalid date'),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  depthKm: z.number().gte(0).lte(800),
  magnitude: z.number().gte(0).lte(10),
  magnitudeType: z.string().max(20).optional(),
  location: z.string().max(500),
  dataClass: z.enum(['live', 'seed', 'mock']).optional(),
  rawPayload: z.unknown().optional(),
});

export type ValidationResult =
  | { ok: true; report: EarthquakeReport }
  | { ok: false; error: string };

const MAX_FUTURE_MS = 5 * 60_000;

export function validateReport(input: unknown, now: number = Date.now()): ValidationResult {
  const parsed = ReportSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${first.path.join('.')}: ${first.message}` : 'invalid report' };
  }
  const occurredMs = Date.parse(parsed.data.occurredAt);
  if (occurredMs > now + MAX_FUTURE_MS) {
    return { ok: false, error: 'occurredAt: timestamp is in the future' };
  }
  return { ok: true, report: parsed.data as EarthquakeReport };
}
