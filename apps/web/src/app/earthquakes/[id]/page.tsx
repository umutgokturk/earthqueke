import type { Metadata } from 'next';
import { EarthquakeDetailClient } from './detail-client';

export const metadata: Metadata = {
  title: 'Deprem Detayı',
  description: 'Deprem kaydının büyüklük, derinlik, konum, kaynak ve en yakın fay bilgileri.',
};

export default function EarthquakeDetailPage({ params }: { params: { id: string } }) {
  return <EarthquakeDetailClient id={params.id} />;
}
