import type { SourceId } from '@ils/types';

/** Reference point for "distance to Istanbul" — city centre (Fatih / historic peninsula). */
export const ISTANBUL_CENTER = { latitude: 41.0082, longitude: 28.9784 } as const;

/** Bounding box used when querying upstream providers (Marmara region). */
export const MARMARA_BBOX = {
  minLat: 39.8,
  maxLat: 41.6,
  minLon: 26.0,
  maxLon: 30.5,
} as const;

/**
 * An earthquake is considered "associated" with a fault segment when its
 * nearest segment lies within this distance. Purely a reporting convention,
 * not a seismological attribution.
 */
export const FAULT_ASSOCIATION_KM = 10;

/** Data freshness thresholds (seconds since last update). */
export const FRESHNESS = {
  liveMaxSeconds: 60,
  delayedMaxSeconds: 300,
} as const;

/** Priority used to pick canonical fields when several sources report one event. */
export const SOURCE_PRIORITY: Record<SourceId, number> = {
  AFAD: 3,
  KANDILLI: 2,
  OTHER: 1,
  MOCK: 0,
};

export const SOURCE_META: Record<SourceId, { name: string; url: string; attribution: string }> = {
  AFAD: {
    name: 'AFAD',
    url: 'https://deprem.afad.gov.tr',
    attribution: 'T.C. İçişleri Bakanlığı Afet ve Acil Durum Yönetimi Başkanlığı (AFAD)',
  },
  KANDILLI: {
    name: 'KANDİLLİ',
    url: 'http://www.koeri.boun.edu.tr',
    attribution: 'Boğaziçi Üniversitesi Kandilli Rasathanesi ve DAE Bölgesel Deprem-Tsunami İzleme Merkezi',
  },
  MOCK: {
    name: 'MOCK (DEV)',
    url: '',
    attribution: 'Geliştirme ortamı için üretilen sentetik veri — gerçek deprem verisi DEĞİLDİR.',
  },
  OTHER: { name: 'DİĞER', url: '', attribution: 'Üçüncü taraf sağlayıcı' },
};

/** Magnitude bins used across charts, legends and markers. */
export const MAGNITUDE_BINS = [
  { key: '0', min: 0, max: 2, label: 'M<2' },
  { key: '2', min: 2, max: 3, label: 'M2–3' },
  { key: '3', min: 3, max: 4, label: 'M3–4' },
  { key: '4', min: 4, max: 5, label: 'M4–5' },
  { key: '5', min: 5, max: 10, label: 'M5+' },
] as const;

/** Depth bins (km). */
export const DEPTH_BINS = [
  { key: '0', min: 0, max: 5, label: '0–5 km' },
  { key: '5', min: 5, max: 10, label: '5–10 km' },
  { key: '10', min: 10, max: 20, label: '10–20 km' },
  { key: '20', min: 20, max: 1000, label: '20+ km' },
] as const;

export const APP_NAME = 'TARİH MİMARLIK';
export const APP_PRODUCT = 'İstanbul Deprem İzleme Paneli';
export const APP_TAGLINE = "İstanbul'un canlı sismik hareketlerini izleyin.";
export const APP_TAGLINE_EN = 'Live Istanbul Earthquake Intelligence';
