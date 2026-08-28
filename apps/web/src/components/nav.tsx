'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { clsx } from 'clsx';
import { BrandMark } from './brand';
import { LiveIndicator } from './live-indicator';
import { GlobalSearch } from './global-search';
import { NotifySettings } from './notify-settings';
import { ThemeToggle } from './theme-toggle';

const LINKS = [
  { href: '/live', label: 'CANLI' },
  { href: '/map', label: 'HARİTA' },
  { href: '/earthquakes', label: 'DEPREMLER' },
  { href: '/analytics', label: 'ANALİZ' },
  { href: '/faults', label: 'FAYLAR' },
  { href: '/history', label: 'GEÇMİŞ' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-ink-900/65 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4">
        <BrandMark />

        <nav aria-label="Ana menü" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'rounded-full px-3.5 py-1.5 text-[11px] font-bold tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                pathname.startsWith(link.href)
                  ? 'bg-accent-soft text-accent ring-1 ring-accent/30 shadow-[0_0_16px_rgb(var(--accent)/0.16)]'
                  : 'text-txt-soft hover:bg-ink-700/80 hover:text-txt',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <GlobalSearch />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <div className="hidden sm:block">
            <NotifySettings />
          </div>
          <div className="hidden sm:block">
            <LiveIndicator />
          </div>
          <div className="sm:hidden">
            <LiveIndicator dotOnly />
          </div>
          <button
            className="rounded-full border border-line p-2 text-txt-soft transition-colors hover:border-line-strong hover:text-txt lg:hidden"
            aria-label="Menüyü aç/kapat"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav aria-label="Mobil menü" className="border-t border-line px-4 py-2 lg:hidden">
          <div className="flex items-center justify-between gap-2 px-1 py-2 sm:hidden">
            <LiveIndicator />
            <span className="flex items-center gap-2">
              <ThemeToggle />
              <NotifySettings />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {[...LINKS, { href: '/api-status', label: 'API DURUMU' }, { href: '/about', label: 'HAKKINDA' }].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  'rounded-lg px-3 py-2 text-[11px] font-bold tracking-[0.14em]',
                  pathname.startsWith(link.href) ? 'bg-accent-soft text-accent' : 'text-txt-soft hover:bg-ink-700',
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <div aria-hidden className="hairline-x" />
    </header>
  );
}
