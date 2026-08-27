import type { Metadata } from 'next';
import { LiveClient } from './live-client';

export const metadata: Metadata = {
  title: 'Canlı İzleme',
  description: 'İstanbul ve Marmara depremlerini tam ekran operasyon modunda gerçek zamanlı izleyin.',
};

export default function LivePage() {
  return <LiveClient />;
}
