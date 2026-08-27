import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AnalyticsClient } from './analytics-client';

export const metadata: Metadata = {
  title: 'Analiz',
  description:
    'İstanbul ve Marmara sismik aktivitesinin zaman serileri, büyüklük/derinlik dağılımları, fay ve ilçe analizleri.',
};

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsClient />
    </Suspense>
  );
}
