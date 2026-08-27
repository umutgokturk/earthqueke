import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HistoryClient } from './history-client';

export const metadata: Metadata = {
  title: 'Geçmiş Veriler',
  description: 'Tarih aralığı, büyüklük ve bölgeye göre geçmiş deprem kayıtlarını inceleyin ve CSV olarak dışa aktarın.',
};

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryClient />
    </Suspense>
  );
}
