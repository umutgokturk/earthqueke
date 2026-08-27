import Link from 'next/link';

const LINE = '#E8EEF7';
const BLUE = '#8FB8E8';
const BLUE_SOFT = 'rgba(143, 184, 232, 0.35)';

/**
 * MESNET MÜHENDİSLİK logo — the structural pin-support mark redrawn as an
 * inline SVG so it scales crisply and adapts to the dark theme (light
 * line-work, light-blue triangle fill).
 */
export function MesnetLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 84" className={className} role="img" aria-label="Mesnet Mühendislik logosu">
      {/* top beam */}
      <rect x="18" y="8" width="84" height="10" rx="3" fill={LINE} />
      {/* pin support triangle */}
      <polygon
        points="60,22 79,58 41,58"
        fill={BLUE_SOFT}
        stroke={LINE}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* ground line */}
      <line x1="24" y1="70" x2="96" y2="70" stroke={LINE} strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/** Navbar brand block: logo + wordmark + product subtitle. */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Ana sayfa — Mesnet Mühendislik">
      <MesnetLogo className={compact ? 'h-7 w-auto' : 'h-8 w-auto sm:h-9'} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={`whitespace-nowrap font-display font-bold text-txt ${
            compact
              ? 'text-xs tracking-[0.22em]'
              : 'text-[12px] tracking-[0.14em] sm:text-[15px] sm:tracking-[0.22em]'
          }`}
        >
          MESNET <span style={{ color: BLUE }}>MÜHENDİSLİK</span>
        </span>
        {!compact && (
          <span className="hidden whitespace-nowrap text-[8px] font-semibold tracking-[0.32em] text-txt-mute sm:block">
            İSTANBUL DEPREM İZLEME PANELİ
          </span>
        )}
      </span>
    </Link>
  );
}
