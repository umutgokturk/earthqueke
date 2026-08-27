import type { Metadata } from 'next';
import { MapClient } from './map-client';

export const metadata: Metadata = {
  title: 'Canlı Harita',
  description: 'İstanbul ve Marmara depremlerini, fay segmentlerini ve ilçeleri interaktif haritada inceleyin.',
};

export default function MapPage() {
  return <MapClient />;
}
