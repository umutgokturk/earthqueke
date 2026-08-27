import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EarthquakesClient } from './earthquakes-client';

export const metadata: Metadata = {
  title: 'Depremler',
  description: 'İstanbul ve Marmara bölgesi depremlerini zaman, büyüklük, derinlik, kaynak ve bölgeye göre filtreleyin.',
};

export default function EarthquakesPage() {
  return (
    <Suspense>
      <EarthquakesClient />
    </Suspense>
  );
}
