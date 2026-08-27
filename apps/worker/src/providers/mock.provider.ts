import { generateSyntheticReport, mulberry32 } from '@ils/database';
import type { EarthquakeReport } from '@ils/types';
import type { EarthquakeProvider } from './types';

/**
 * Mock development provider.
 * Emits clearly-labelled synthetic events (source MOCK, dataClass 'mock') on
 * a Poisson-like schedule so the live pipeline can be exercised without the
 * real upstreams. Hard-disabled in production: the constructor throws.
 */
export class MockProvider implements EarthquakeProvider {
  readonly id = 'MOCK' as const;
  readonly name = 'MOCK (DEV)';

  private rng: () => number;
  private counter = 0;
  private lastEmitted: EarthquakeReport | null = null;
  private pending: EarthquakeReport[] = [];

  constructor(nodeEnv: string, opts: { meanIntervalMs?: number; seed?: number } = {}) {
    if (nodeEnv === 'production') {
      throw new Error('MockProvider must never be instantiated in production');
    }
    this.meanIntervalMs = opts.meanIntervalMs ?? 90_000;
    this.rng = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  }

  private meanIntervalMs: number;
  private lastCallAt: number | null = null;

  /** Force the next call to emit at least one event (useful in demos/tests). */
  queueImmediateEvent(): void {
    const report = generateSyntheticReport(this.rng, Date.now() - 2_000, this.counter++, 'mock', 'mock');
    this.pending.push(report);
  }

  async getLatestEarthquakes(): Promise<EarthquakeReport[]> {
    const now = Date.now();
    const out: EarthquakeReport[] = [...this.pending];
    this.pending = [];

    const elapsed = this.lastCallAt === null ? this.meanIntervalMs : now - this.lastCallAt;
    this.lastCallAt = now;
    // Poisson arrival: P(≥1 event in `elapsed`) = 1 - e^(-elapsed/mean)
    const p = 1 - Math.exp(-elapsed / this.meanIntervalMs);
    if (this.rng() < p) {
      const report = generateSyntheticReport(
        this.rng,
        now - Math.floor(this.rng() * 15_000),
        this.counter++,
        'mock',
        'mock',
      );
      out.push(report);
      this.lastEmitted = report;
    } else if (this.lastEmitted && this.rng() < 0.12) {
      // Occasionally re-report the last event with a slightly revised
      // magnitude to exercise the merge/update path (like a REVIZE line).
      const revised: EarthquakeReport = {
        ...this.lastEmitted,
        magnitude: Math.max(0.5, Math.round((this.lastEmitted.magnitude + (this.rng() - 0.5) * 0.4) * 10) / 10),
      };
      out.push(revised);
    }
    return out;
  }
}
