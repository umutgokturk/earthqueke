import type { EarthquakeReport, SourceId } from '@ils/types';

/** Bounding box passed to providers when the upstream API supports one. */
export interface ProviderBbox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ProviderOptions {
  bbox: ProviderBbox;
  /** How far back each poll looks (ms). Overlap is fine — dedupe handles it. */
  windowMs: number;
  timeoutMs: number;
}

/**
 * Provider adapter contract (section 16 of the product spec): every provider
 * fetches from its upstream and returns reports normalized to the shared
 * EarthquakeReport model.
 */
export interface EarthquakeProvider {
  readonly id: SourceId;
  readonly name: string;
  getLatestEarthquakes(): Promise<EarthquakeReport[]>;
}

export async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'istanbul-live-seismic/1.0 (open-source monitoring dashboard)',
        ...init?.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
