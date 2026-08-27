import Link from 'next/link';

export function FooterBar() {
  return (
    <footer className="border-t border-line bg-ink-900/70">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-4 text-[11px] text-txt-mute sm:flex-row sm:items-center sm:justify-between">
        <p>
          Bu platform resmî bir deprem ölçüm kurumu değildir ve deprem tahmini yapmaz. Veriler AFAD ve Kandilli
          Rasathanesi&apos;nin yayınladığı bilgilerden alınmaktadır.
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
