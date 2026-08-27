/**
 * Design tokens shared by every app surface.
 * Chart & map colors were validated with the dataviz palette validator
 * against the panel surface (#0B1220): the categorical series trio passes
 * all-pairs CVD + contrast checks; the recency ramp is a validated ordinal
 * single-hue ramp (marker SIZE additionally encodes magnitude, so color is
 * never the only channel).
 */

export const SURFACES = {
  page: '#060A12',
  panel: '#0B1220',
  raised: '#101A2C',
} as const;

export const TEXT = {
  primary: '#E8EEF7',
  secondary: '#94A3B8',
  muted: '#64748B',
} as const;

/** Categorical chart series — validated all-pairs on #0B1220. */
export const SERIES = ['#0899B8', '#DE640D', '#8B5CF6'] as const;

/** Ordinal recency ramp (bright = new) — validated `--ordinal` on #0B1220. */
export const RECENCY_RAMP = [
  { maxAgeH: 1, color: '#7DEBFF', label: 'Son 1 saat' },
  { maxAgeH: 6, color: '#22D3EE', label: 'Son 6 saat' },
  { maxAgeH: 24, color: '#0891B2', label: 'Son 24 saat' },
  { maxAgeH: Infinity, color: '#155E75', label: 'Daha eski' },
] as const;

/** Status colors — always paired with a text label, never color alone. */
export const STATUS_COLORS = {
  ONLINE: '#34D399',
  DEGRADED: '#FBBF24',
  OFFLINE: '#F87171',
  DISABLED: '#64748B',
  UNKNOWN: '#64748B',
} as const;

/**
 * Magnitude class colors for LABELLED chips/legend rows only (the numeric
 * value is always printed with them). Charts encode magnitude by axis/size,
 * not by these hues.
 */
export const MAG_COLORS = [
  { min: 0, color: '#38BDF8', label: 'M<2' },
  { min: 2, color: '#FACC15', label: 'M2–3' },
  { min: 3, color: '#FB923C', label: 'M3–4' },
  { min: 4, color: '#F87171', label: 'M4–5' },
  { min: 5, color: '#E879F9', label: 'M5+' },
] as const;

export function magColor(magnitude: number): string {
  let color: string = MAG_COLORS[0].color;
  for (const step of MAG_COLORS) {
    if (magnitude >= step.min) color = step.color;
  }
  return color;
}

export function recencyColor(ageHours: number): string {
  for (const step of RECENCY_RAMP) {
    if (ageHours <= step.maxAgeH) return step.color;
  }
  return RECENCY_RAMP[3].color;
}

export const ACTIVITY_LEVEL_META: Record<string, { label: string; color: string }> = {
  LOW: { label: 'DÜŞÜK', color: '#34D399' },
  MODERATE: { label: 'ORTA', color: '#FACC15' },
  ELEVATED: { label: 'YÜKSELMİŞ', color: '#FB923C' },
  HIGH: { label: 'YÜKSEK', color: '#F87171' },
  VERY_HIGH: { label: 'ÇOK YÜKSEK', color: '#E879F9' },
};
