import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tarih Mimarlık — İstanbul Deprem Paneli',
    short_name: 'Tarih Mimarlık',
    description:
      'İstanbul ve Marmara bölgesindeki güncel deprem verilerini, fay hatlarını ve sismik aktivite analizlerini canlı olarak izleyin.',
    start_url: '/',
    display: 'standalone',
    background_color: '#060A12',
    theme_color: '#060A12',
    lang: 'tr',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
