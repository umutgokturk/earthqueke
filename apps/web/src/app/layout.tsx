import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { Providers } from '@/components/providers';
import { FooterBar } from '@/components/footer-bar';

export const metadata: Metadata = {
  title: {
    default: 'İstanbul Live Seismic | Canlı İstanbul Deprem Verileri',
    template: '%s | İstanbul Live Seismic',
  },
  description:
    'İstanbul ve Marmara bölgesindeki güncel deprem verilerini, fay hatlarını ve sismik aktivite analizlerini canlı olarak izleyin.',
  keywords: ['istanbul deprem', 'son depremler', 'marmara deprem', 'fay hattı', 'canlı deprem', 'sismik aktivite'],
  openGraph: {
    title: 'İstanbul Live Seismic — Canlı İstanbul Deprem Verileri',
    description:
      'İstanbul ve Marmara bölgesindeki güncel deprem verilerini, fay hatlarını ve sismik aktivite analizlerini canlı olarak izleyin.',
    type: 'website',
    locale: 'tr_TR',
    siteName: 'İstanbul Live Seismic',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#060A12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter with a graceful system fallback when the font host is unreachable */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-4">{children}</main>
          <FooterBar />
        </Providers>
      </body>
    </html>
  );
}
