import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { Providers } from '@/components/providers';
import { FooterBar } from '@/components/footer-bar';

export const metadata: Metadata = {
  title: {
    default: 'Mesnet Mühendislik | Canlı İstanbul Deprem Paneli',
    template: '%s | Mesnet Mühendislik',
  },
  description:
    'Mesnet Mühendislik deprem izleme paneli: İstanbul ve Marmara bölgesindeki güncel deprem verilerini, fay hatlarını ve sismik aktivite analizlerini canlı olarak izleyin.',
  keywords: ['istanbul deprem', 'son depremler', 'marmara deprem', 'fay hattı', 'canlı deprem', 'sismik aktivite', 'mesnet mühendislik'],
  openGraph: {
    title: 'Mesnet Mühendislik — Canlı İstanbul Deprem Paneli',
    description:
      'İstanbul ve Marmara bölgesindeki güncel deprem verilerini, fay hatlarını ve sismik aktivite analizlerini canlı olarak izleyin.',
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Mesnet Mühendislik',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#F5F7FB',
  width: 'device-width',
  initialScale: 1,
};

/* İlk boyamadan önce kayıtlı temayı uygular — tema titremesini önler. */
const themeInitScript = `try{var s=localStorage.getItem('ils-theme');var t=s?JSON.parse(s).state.theme:null;document.documentElement.dataset.theme=(t==='dark'?'dark':'light');}catch(e){document.documentElement.dataset.theme='light';}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter + Space Grotesk with graceful system fallbacks when the font host is unreachable */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
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
