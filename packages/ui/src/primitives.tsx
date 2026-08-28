import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { MAG_COLORS, STATUS_COLORS, magStep } from './tokens';

/* Reusable presentational atoms (Tailwind classes resolved by the app build). */

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={clsx('panel rounded-xl shadow-panel backdrop-blur-sm', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-soft">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-txt-mute">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function StatusDot({
  status,
  pulse = false,
  className,
}: {
  status: keyof typeof STATUS_COLORS | string;
  pulse?: boolean;
  className?: string;
}): ReactNode {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.UNKNOWN;
  return (
    <span
      aria-hidden
      className={clsx('inline-block h-2 w-2 rounded-full', pulse && 'animate-pulse-dot', className)}
      style={{ backgroundColor: color, boxShadow: pulse ? `0 0 8px ${color}` : undefined }}
    />
  );
}

/** Magnitude chip — the numeric value is always printed (never color alone). */
export function MagnitudeBadge({ magnitude, className }: { magnitude: number; className?: string }): ReactNode {
  const step = magStep(magnitude);
  return (
    <span
      className={clsx(
        'inline-flex min-w-[52px] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums',
        className,
      )}
      style={{
        color: step.color,
        borderColor: `rgb(var(${step.rgbVar}) / 0.4)`,
        backgroundColor: `rgb(var(${step.rgbVar}) / 0.12)`,
      }}
      aria-label={`Büyüklük ${magnitude.toFixed(1)}`}
    >
      M{magnitude.toFixed(1)}
    </span>
  );
}

export function SourceBadge({ source, className }: { source: string; className?: string }): ReactNode {
  const label = source === 'MOCK' ? 'MOCK (DEV)' : source === 'KANDILLI' ? 'KANDİLLİ' : source;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border border-line-strong px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-txt-soft',
        source === 'MOCK' && 'border-status-warn/50 text-status-warn',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Badge for anything that is not live data — seed/mock is always labelled. */
export function DataClassBadge({ dataClass, className }: { dataClass: string; className?: string }): ReactNode {
  if (dataClass === 'live') return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border border-status-warn/60 bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-status-warn',
        className,
      )}
      title="DEVELOPMENT DATA — Bu kayıt geliştirme ortamı için üretilmiş sentetik veridir; gerçek deprem verisi değildir."
      aria-label="Geliştirme verisi — gerçek deprem verisi değildir"
    >
      DEV
    </span>
  );
}

export function Skeleton({ className }: { className?: string }): ReactNode {
  return <div className={clsx('animate-pulse rounded-md bg-ink-600/50', className)} aria-hidden />;
}

export function EmptyState({
  title,
  hint,
  icon,
  className,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <div className="text-2xl text-txt-mute" aria-hidden>
        {icon ?? '◌'}
      </div>
      <p className="text-sm font-medium text-txt-soft">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-txt-mute">{hint}</p> : null}
    </div>
  );
}

/** Legend for the magnitude chip scale (labels carry the meaning). */
export function MagnitudeLegend({ className }: { className?: string }): ReactNode {
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {MAG_COLORS.map((step) => (
        <span key={step.label} className="flex items-center gap-1.5 text-[10px] text-txt-mute">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} />
          {step.label}
        </span>
      ))}
    </div>
  );
}
