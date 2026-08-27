import type { Metadata } from 'next';
import { ApiStatusClient } from './status-client';

export const metadata: Metadata = {
  title: 'API Durumu',
  description: 'Veri kaynakları, veritabanı, Redis ve WebSocket servislerinin canlı sağlık durumu.',
};

export default function ApiStatusPage() {
  return <ApiStatusClient />;
}
