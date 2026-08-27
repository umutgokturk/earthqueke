import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FaultsClient } from './faults-client';

export const metadata: Metadata = {
  title: 'Fay Segmentleri',
  description:
    'Marmara Denizi fay segmentlerinin yaklaşık geometrileri, segment bazlı deprem istatistikleri ve analizleri.',
};

export default function FaultsPage() {
  return (
    <Suspense>
      <FaultsClient />
    </Suspense>
  );
}
