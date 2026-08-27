import type { LineStringGeometry, MultiLineStringGeometry } from '@ils/types';

/**
 * ⚠️ VERİ NOTU / DATA NOTE — FAY GEOMETRİLERİ
 *
 * The polylines below are SIMPLIFIED, APPROXIMATE digitizations of the
 * northern branch of the North Anatolian Fault under the Sea of Marmara,
 * drawn at coarse resolution from widely published segment maps
 * (MTA Yenilenmiş Diri Fay Haritası; AFAD Türkiye Deprem Tehlike Haritaları;
 * peer-reviewed Marmara fault literature, e.g. Le Pichon et al. 2001,
 * Armijo et al. 2002 segment naming).
 *
 * They are intended ONLY for visualization and coarse "nearest segment"
 * reporting. They are NOT survey-grade geometry, carry `approximate: true`
 * and `lastVerified: null`, and every UI surface must label them as
 * "yaklaşık geometri". Authoritative data: https://tdvms.afad.gov.tr and
 * MTA diri fay haritası services. Do not present these as verified geometry.
 */

export interface FaultSeed {
  slug: string;
  name: string;
  segmentType: string;
  description: string;
  geometry: LineStringGeometry | MultiLineStringGeometry;
  approximate: boolean;
  isZone: boolean;
  source: string;
  sourceUrl: string;
  license: string;
  lastVerified: string | null;
}

const line = (coords: [number, number][]): LineStringGeometry => ({
  type: 'LineString',
  coordinates: coords,
});

const FAULT_SOURCE =
  'Basitleştirilmiş yaklaşık sayısallaştırma — MTA Yenilenmiş Diri Fay Haritası ve yayımlanmış Marmara fay segmenti literatürüne (Le Pichon vd. 2001; Armijo vd. 2002) dayalıdır. Bilimsel kullanım için uygun değildir.';
const FAULT_SOURCE_URL = 'https://tdvms.afad.gov.tr';
const FAULT_LICENSE =
  'Türetilmiş yaklaşık geometri; resmi/güncel veri için MTA ve AFAD kaynaklarına başvurun.';

const TEKIRDAG: [number, number][] = [
  [27.25, 40.66],
  [27.45, 40.7],
  [27.65, 40.73],
  [27.9, 40.79],
  [28.05, 40.82],
];
const ORTA_MARMARA: [number, number][] = [
  [28.05, 40.82],
  [28.25, 40.84],
  [28.45, 40.85],
];
const KUMBURGAZ: [number, number][] = [
  [28.45, 40.85],
  [28.65, 40.86],
  [28.85, 40.87],
];
const ADALAR: [number, number][] = [
  [28.85, 40.87],
  [29.0, 40.865],
  [29.12, 40.83],
  [29.25, 40.78],
];
const CINARCIK: [number, number][] = [
  [28.9, 40.7],
  [29.1, 40.69],
  [29.3, 40.67],
  [29.5, 40.66],
];

export const FAULT_SEEDS: FaultSeed[] = [
  {
    slug: 'tekirdag-segmenti',
    name: 'Tekirdağ Segmenti',
    segmentType: 'doğrultu atımlı (sağ yanal)',
    description:
      'Kuzey Anadolu Fayı kuzey kolunun Ganos–Tekirdağ Havzası boyunca uzanan batı segmenti (yaklaşık geometri).',
    geometry: line(TEKIRDAG),
    approximate: true,
    isZone: false,
    source: FAULT_SOURCE,
    sourceUrl: FAULT_SOURCE_URL,
    license: FAULT_LICENSE,
    lastVerified: null,
  },
  {
    slug: 'orta-marmara-segmenti',
    name: 'Orta Marmara Segmenti',
    segmentType: 'doğrultu atımlı (sağ yanal)',
    description:
      'Orta Marmara Havzası boyunca uzanan Ana Marmara Fayı bölümü (yaklaşık geometri).',
    geometry: line(ORTA_MARMARA),
    approximate: true,
    isZone: false,
    source: FAULT_SOURCE,
    sourceUrl: FAULT_SOURCE_URL,
    license: FAULT_LICENSE,
    lastVerified: null,
  },
  {
    slug: 'kumburgaz-segmenti',
    name: 'Kumburgaz Segmenti',
    segmentType: 'doğrultu atımlı (sağ yanal)',
    description:
      'Kumburgaz Havzası boyunca uzanan, Orta Marmara ile Adalar segmentleri arasındaki bölüm (yaklaşık geometri).',
    geometry: line(KUMBURGAZ),
    approximate: true,
    isZone: false,
    source: FAULT_SOURCE,
    sourceUrl: FAULT_SOURCE_URL,
    license: FAULT_LICENSE,
    lastVerified: null,
  },
  {
    slug: 'adalar-segmenti',
    name: 'Adalar Segmenti',
    segmentType: 'doğrultu atımlı (sağ yanal)',
    description:
      'Çınarcık Havzası kuzey kenarını izleyen, Adalar (Prens Adaları) açıklarından geçen segment (yaklaşık geometri).',
    geometry: line(ADALAR),
    approximate: true,
    isZone: false,
    source: FAULT_SOURCE,
    sourceUrl: FAULT_SOURCE_URL,
    license: FAULT_LICENSE,
    lastVerified: null,
  },
  {
    slug: 'cinarcik-segmenti',
    name: 'Çınarcık Segmenti',
    segmentType: 'oblik / normal bileşenli',
    description:
      'Çınarcık Havzası güney kenarında, Yalova–Çınarcık açıklarında uzanan fay bölümü (yaklaşık geometri).',
    geometry: line(CINARCIK),
    approximate: true,
    isZone: false,
    source: FAULT_SOURCE,
    sourceUrl: FAULT_SOURCE_URL,
    license: FAULT_LICENSE,
    lastVerified: null,
  },
  {
    slug: 'marmara-ana-fay-zonu',
    name: 'Marmara Ana Fay Zonu',
    segmentType: 'zon (birleşik ana iz)',
    description:
      'Kuzey Anadolu Fayı kuzey kolunun Marmara Denizi altındaki birleşik ana izi. Segment bazlı istatistiklerde çift saymayı önlemek için en-yakın-fay atamasının dışında tutulur (yaklaşık geometri).',
    geometry: {
      type: 'MultiLineString',
      coordinates: [TEKIRDAG, ORTA_MARMARA, KUMBURGAZ, ADALAR],
    },
    approximate: true,
    isZone: true,
    source: FAULT_SOURCE,
    sourceUrl: FAULT_SOURCE_URL,
    license: FAULT_LICENSE,
    lastVerified: null,
  },
];
