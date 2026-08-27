'use client';

import Link from 'next/link';
import { Card, Skeleton } from '@ils/ui';
import { fmtKm, fmtMag } from '@/lib/format';
import { useActivity, useStats } from '@/lib/queries';
import { ActivityMini } from './activity-gauge';

function Kpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <Card className="h-full px-4 py-3 transition-colors hover:border-line-strong">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-mute">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-txt">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-txt-mute">{hint}</p> : null}
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/** KPI row (spec §7): counts, max magnitude, avg depth, nearest event, activity. */
export function KpiCards({ region }: { region?: string }) {
  const { data: stats, isLoading } = useStats(region);
  const { data: activity } = useActivity('marmara');

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-14" />
          </Card>
        ))}
      </div>
    );
  }

  const max = stats.maxMagnitude24h;
  const nearest = stats.nearestToIstanbul24h;
  const marmara = activity?.[0];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      <Kpi label="Son 1 Saat" value={stats.counts.h1} hint="deprem" href="/earthquakes?range=1h" />
      <Kpi label="Son 24 Saat" value={stats.counts.h24} hint="deprem" href="/earthquakes?range=24h" />
      <Kpi label="Son 7 Gün" value={stats.counts.d7} hint="deprem" href="/earthquakes?range=7d" />
      <Kpi
        label="Maks. Büyüklük (24s)"
        value={max ? `M ${fmtMag(max.value)}` : '—'}
        hint={max?.event ? max.event.location : 'kayıt yok'}
        href={max?.event ? `/earthquakes/${max.event.id}` : undefined}
      />
      <Kpi
        label="Ort. Derinlik (24s)"
        value={stats.avgDepthKm24h !== null ? `${stats.avgDepthKm24h.toFixed(1)} km` : '—'}
      />
      <Kpi
        label="İstanbul'a En Yakın"
        value={nearest ? fmtKm(nearest.distanceKm) : '—'}
        hint={nearest ? `M${fmtMag(nearest.event.magnitude)} · ${nearest.event.location}` : 'son 24 saat'}
        href={nearest ? `/earthquakes/${nearest.event.id}` : undefined}
      />
      <Card className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-mute">Aktivite İndeksi</p>
        {marmara ? (
          <ActivityMini snapshot={marmara} />
        ) : (
          <Skeleton className="mt-2 h-7 w-full" />
        )}
      </Card>
    </div>
  );
}
