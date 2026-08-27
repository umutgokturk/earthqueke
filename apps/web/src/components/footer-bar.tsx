import Link from 'next/link';
import { MesnetLogo } from './brand';

export function FooterBar() {
  return (
    <footer className="bg-ink-900/60">
      <div aria-hidden className="hairline-x" />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-5 text-[11px] text-txt-mute sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-3">
          <MesnetLogo className="h-8 w-auto shrink-0 opacity-80" />
          <span>
            <span className="font-display font-bold tracking-[0.18em] text-txt-soft">MESNET MÜHENDİSLİK</span> · Bu panel
            resmî bir deprem ölçüm kurumu değildir ve deprem tahmini yapmaz. Veriler AFAD ve Kandilli
            Rasathanesi&apos;nin yayınladığı bilgilerden alınmaktadır.
          </span>
        </p>
        <nav className="flex shrink-0 items-center gap-3" aria-label="Alt menü">
          <Link href="/about" className="hover:text-txt-soft">
            Hakkında
          </Link>
          <Link href="/api-status" className="hover:text-txt-soft">
            API Durumu
          </Link>
          <a href="/api/docs" className="hover:text-txt-soft" target="_blank" rel="noreferrer">
            API Docs
          </a>
          <Link href="/admin" className="hover:text-txt-soft">
            Admin
          </Link>
        </nav>
      </div>
    </footer>
  );
}
