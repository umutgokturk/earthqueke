import type { Metadata } from 'next';
import { DashboardClient } from './dashboard-client';

export const metadata: Metadata = {
  title: 'Tarih Mimarlık | Canlı İstanbul Deprem Paneli',
  description:
    'İstanbul ve Marmara bölgesindeki güncel deprem verilerini, fay hatlarını ve sismik aktivite analizlerini canlı olarak izleyin.',
};

export default function HomePage() {
  return <DashboardClient />;
}
