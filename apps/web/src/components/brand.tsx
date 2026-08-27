import Link from 'next/link';

const LINE = '#E8EEF7';
const INK = '#0B1220';
const TREE = '#F59E0B';

/**
 * TARİH MİMARLIK logo — the modern-house mark redrawn as an inline SVG so it
 * scales crisply and adapts to the dark theme (light line-work, orange trees).
 */
export function TarihLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 230 132" className={className} role="img" aria-label="Tarih Mimarlık logosu">
      {/* ground */}
      <line x1="18" y1="124" x2="212" y2="124" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      {/* left tree */}
      <line x1="36" y1="100" x2="36" y2="124" stroke={LINE} strokeWidth="2" />
      <circle cx="36" cy="96" r="15" fill={TREE} />
      <path d="M36 104 V90 M36 98 l7 -6" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* right tree */}
      <line x1="206" y1="100" x2="206" y2="124" stroke={LINE} strokeWidth="2" />
      <circle cx="206" cy="96" r="15" fill={TREE} />
      <path d="M206 104 V90 M206 98 l-7 -6" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* tower */}
      <polygon points="64,18 96,11 96,124 64,124" fill={LINE} />
      <line x1="56" y1="23" x2="103" y2="11" stroke={LINE} strokeWidth="5" strokeLinecap="round" />
      <rect x="70" y="26" width="18" height="40" rx="2" fill={INK} />
      <path d="M74 56 l10 -12 M74 48 l6 -7" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="70" y="72" width="18" height="40" rx="2" fill={INK} />
      <path d="M74 102 l10 -12 M74 94 l6 -7" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
      {/* right wing: sloped roof + glass grid */}
      <line x1="96" y1="30" x2="200" y2="59" stroke={LINE} strokeWidth="5" strokeLinecap="round" />
      <polygon points="99,38 188,62 188,74 99,74" fill="none" stroke={LINE} strokeWidth="2" />
      <line x1="121" y1="43.5" x2="121" y2="74" stroke={LINE} strokeWidth="1.6" />
      <line x1="144" y1="49.5" x2="144" y2="74" stroke={LINE} strokeWidth="1.6" />
      <line x1="167" y1="55.5" x2="167" y2="74" stroke={LINE} strokeWidth="1.6" />
      <line x1="99" y1="57" x2="188" y2="68" stroke={LINE} strokeWidth="1.4" />
      <path d="M106 52 l8 -9 M129 58 l8 -9 M152 64 l8 -9" stroke={LINE} strokeWidth="1.3" strokeLinecap="round" />
      {/* fascia + lower floor */}
      <rect x="95" y="74" width="99" height="7" fill="none" stroke={LINE} strokeWidth="2" />
      <rect x="99" y="81" width="91" height="43" fill="none" stroke={LINE} strokeWidth="2" />
      <rect x="107" y="90" width="9" height="19" fill="none" stroke={LINE} strokeWidth="1.8" />
      <rect x="121" y="90" width="9" height="19" fill="none" stroke={LINE} strokeWidth="1.8" />
      <rect x="135" y="90" width="9" height="19" fill="none" stroke={LINE} strokeWidth="1.8" />
      <rect x="149" y="90" width="9" height="19" fill="none" stroke={LINE} strokeWidth="1.8" />
      <rect x="164" y="88" width="20" height="36" fill="none" stroke={LINE} strokeWidth="2" />
      <line x1="174" y1="88" x2="174" y2="124" stroke={LINE} strokeWidth="1.6" />
    </svg>
  );
}

/** Navbar brand block: logo + serif wordmark + product subtitle. */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Ana sayfa — Tarih Mimarlık">
      <TarihLogo className={compact ? 'h-7 w-auto' : 'h-10 w-auto'} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={`whitespace-nowrap font-serif font-bold tracking-[0.22em] text-txt ${compact ? 'text-xs' : 'text-[15px]'}`}
        >
          TARİH <span style={{ color: TREE }}>MİMARLIK</span>
        </span>
        {!compact && (
          <span className="whitespace-nowrap text-[8px] font-semibold tracking-[0.32em] text-txt-mute">
            İSTANBUL DEPREM İZLEME PANELİ
          </span>
        )}
      </span>
    </Link>
  );
}
