'use client';

import Link from 'next/link';
import { Card, Skeleton } from '@ils/ui';
import { fmtKm, fmtMag } from '@/lib/format';
import { useActivity, useStats } from '@/lib/queries';
import { ActivityMini } from './activity-gauge';

function StatCell({
  label,
  value,
  hint,
  href,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className="min-w-0 rounded-lg px-3 py-2 transition-colors hover:bg-ink-700/40">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-mute">{label}</p>
      {children ?? (
        <>
          <p className="mt-1.5 truncate font-display text-2xl font-bold leading-none tracking-tight tabular-nums text-txt">
            {value}
          </p>
          {hint ? <p className="mt-1 truncate text-[11px] text-txt-mute">{hint}</p> : null}
        </>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block min-w-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/**
 * KPI strip (spec §7) — one calm panel instead of a row of boxes.
 * Secondary numbers live in the hints; avg depth moved to analytics.
 */
export function KpiCards({ region }: { region?: string }) {
  const { data: stats, isLoading } = useStats(region);
  const { data: activity } = useActivity('marmara');

  if (isLoading || !stats) {
    return (
      <Card className="grid grid-cols-2 gap-2 px-2 py-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-3 py-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-7 w-16" />
          </div>
        ))}
      </Card>
    );
  }

  const max = stats.maxMagnitude24h;
  const nearest = stats.nearestToIstanbul24h;
  const marmara = activity?.[0];

  return (
    <Card className="grid grid-cols-2 gap-2 px-2 py-2 lg:grid-cols-4">
      <StatCell
        label="Son 24 Saat"
        value={stats.counts.h24}
        hint={`deprem · 1s: ${stats.counts.h1} · 7g: ${stats.counts.d7}`}
        href="/earthquakes?range=24h"
      />
      <StatCell
        label="Maks. Büyüklük"
        value={max ? `M ${fmtMag(max.value)}` : '—'}
        hint={max?.event ? max.event.location : 'son 24 saatte kayıt yok'}
        href={max?.event ? `/earthquakes/${max.event.id}` : undefined}
      />
      <StatCell
        label="İstanbul'a En Yakın"
        value={nearest ? fmtKm(nearest.distanceKm) : '—'}
        hint={nearest ? `M${fmtMag(nearest.event.magnitude)} · ${nearest.event.location}` : 'son 24 saat'}
        href={nearest ? `/earthquakes/${nearest.event.id}` : undefined}
      />
      <StatCell label="Aktivite İndeksi">
        {marmara ? <ActivityMini snapshot={marmara} /> : <Skeleton className="mt-2 h-7 w-full" />}
      </StatCell>
    </Card>
  );
}
