/**
 * Design tokens shared by every app surface — theme-aware.
 * DOM/SVG renkleri CSS değişkenleri üzerinden gelir (globals.css iki temayı
 * da tanımlar); MapLibre canvas'ı CSS değişkeni okuyamadığı için harita
 * renkleri MAP_THEME içinde tema başına somut hex olarak durur.
 * Grafik serileri ve tazelik rampası dataviz doğrulayıcısından geçmiştir:
 * koyu yüzey #0B1220 ve açık yüzey #FFFFFF/#F5F7FB için ayrı ayrı.
 */

export const SURFACES = {
  page: 'rgb(var(--ink-900))',
  panel: 'rgb(var(--ink-800))',
  raised: 'rgb(var(--ink-700))',
} as const;

export const TEXT = {
  primary: 'rgb(var(--txt))',
  secondary: 'rgb(var(--txt-soft))',
  muted: 'rgb(var(--txt-mute))',
} as const;

/** Categorical chart series — validated per theme (dataviz). */
export const SERIES = ['rgb(var(--series-1))', 'rgb(var(--series-2))', 'rgb(var(--series-3))'] as const;

/** Ordinal recency ramp (index 0 = en yeni) — validated per theme. */
export const RECENCY_RAMP = [
  { maxAgeH: 1, color: 'rgb(var(--recency-1))', label: 'Son 1 saat' },
  { maxAgeH: 6, color: 'rgb(var(--recency-2))', label: 'Son 6 saat' },
  { maxAgeH: 24, color: 'rgb(var(--recency-3))', label: 'Son 24 saat' },
  { maxAgeH: Infinity, color: 'rgb(var(--recency-4))', label: 'Daha eski' },
] as const;

/** Status colors — always paired with a text label, never color alone. */
export const STATUS_COLORS = {
  ONLINE: 'rgb(var(--status-good))',
  DEGRADED: 'rgb(var(--status-warn))',
  OFFLINE: 'rgb(var(--status-bad))',
  DISABLED: 'rgb(var(--txt-mute))',
  UNKNOWN: 'rgb(var(--txt-mute))',
} as const;

/**
 * Magnitude class tokens for LABELLED chips/legend rows only (the numeric
 * value is always printed with them). `rgbVar` alfa türevleri için ham
 * değişken adıdır (ör. rgb(var(--mag-m3) / 0.4)).
 */
export const MAG_COLORS = [
  { min: 0, rgbVar: '--mag-m1', color: 'rgb(var(--mag-m1))', label: 'M<2' },
  { min: 2, rgbVar: '--mag-m2', color: 'rgb(var(--mag-m2))', label: 'M2–3' },
  { min: 3, rgbVar: '--mag-m3', color: 'rgb(var(--mag-m3))', label: 'M3–4' },
  { min: 4, rgbVar: '--mag-m4', color: 'rgb(var(--mag-m4))', label: 'M4–5' },
  { min: 5, rgbVar: '--mag-m5', color: 'rgb(var(--mag-m5))', label: 'M5+' },
] as const;

export function magStep(magnitude: number): (typeof MAG_COLORS)[number] {
  let step: (typeof MAG_COLORS)[number] = MAG_COLORS[0];
  for (const s of MAG_COLORS) {
    if (magnitude >= s.min) step = s;
  }
  return step;
}

export function magColor(magnitude: number): string {
  return magStep(magnitude).color;
}

export function recencyColor(ageHours: number): string {
  for (const step of RECENCY_RAMP) {
    if (ageHours <= step.maxAgeH) return step.color;
  }
  return RECENCY_RAMP[3].color;
}

export const ACTIVITY_LEVEL_META: Record<string, { label: string; color: string }> = {
  LOW: { label: 'DÜŞÜK', color: 'rgb(var(--status-good))' },
  MODERATE: { label: 'ORTA', color: 'rgb(var(--status-warn))' },
  ELEVATED: { label: 'YÜKSELMİŞ', color: 'rgb(var(--status-serious))' },
  HIGH: { label: 'YÜKSEK', color: 'rgb(var(--status-bad))' },
  VERY_HIGH: { label: 'ÇOK YÜKSEK', color: 'rgb(var(--mag-m5))' },
};

/** MapLibre paint renkleri — canvas CSS değişkeni okuyamaz, tema başına somut. */
export interface MapThemeColors {
  rasterPath: 'dark_all' | 'light_all';
  maptilerStyle: 'dataviz-dark' | 'dataviz-light';
  background: string;
  /** nokta/çizgi kenar rengi (zeminle ayrışma) */
  casing: string;
  boundary: string;
  faultLine: string;
  faultLabel: string;
  labelHalo: string;
  districtDot: string;
  districtLabel: string;
  pulse: string;
  userMarker: string;
  recencySteps: ReadonlyArray<readonly [number, string]>;
  recencyOld: string;
  heat: ReadonlyArray<readonly [number, string]>;
}

export const MAP_THEME: Record<'light' | 'dark', MapThemeColors> = {
  dark: {
    rasterPath: 'dark_all',
    maptilerStyle: 'dataviz-dark',
    background: '#060A12',
    casing: '#060A12',
    boundary: '#64748B',
    faultLine: '#EF6A6A',
    faultLabel: '#F0A5A5',
    labelHalo: '#060A12',
    districtDot: '#94A3B8',
    districtLabel: '#94A3B8',
    pulse: '#7DEBFF',
    userMarker: '#22D3EE',
    recencySteps: [
      [1, '#7DEBFF'],
      [6, '#22D3EE'],
      [24, '#0891B2'],
    ],
    recencyOld: '#155E75',
    heat: [
      [0, 'rgba(8,153,184,0)'],
      [0.25, 'rgba(8,153,184,0.35)'],
      [0.5, 'rgba(34,211,238,0.5)'],
      [0.75, 'rgba(125,235,255,0.65)'],
      [1, 'rgba(232,238,247,0.8)'],
    ],
  },
  light: {
    rasterPath: 'light_all',
    maptilerStyle: 'dataviz-light',
    background: '#F5F7FB',
    casing: '#FFFFFF',
    boundary: '#64748B',
    faultLine: '#DC2626',
    faultLabel: '#B91C1C',
    labelHalo: '#FFFFFF',
    districtDot: '#64748B',
    districtLabel: '#475569',
    pulse: '#0E7490',
    userMarker: '#0891B2',
    recencySteps: [
      [1, '#083344'],
      [6, '#155E75'],
      [24, '#0E7490'],
    ],
    recencyOld: '#5EB8D6',
    heat: [
      [0, 'rgba(8,145,178,0)'],
      [0.25, 'rgba(8,145,178,0.25)'],
      [0.5, 'rgba(14,116,144,0.4)'],
      [0.75, 'rgba(21,94,117,0.55)'],
      [1, 'rgba(8,51,68,0.7)'],
    ],
  },
} as const;
