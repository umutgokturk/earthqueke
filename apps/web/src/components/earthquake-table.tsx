'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { Earthquake } from '@ils/types';
import { DataClassBadge, EmptyState, MagnitudeBadge, Skeleton, SourceBadge } from '@ils/ui';
import { fmtCoord, fmtDepth, fmtKm, fmtShort, fmtTime } from '@/lib/format';

const HEADERS = [
  'Zaman',
  'Büyüklük',
  'Derinlik',
  'Konum',
  'Enlem',
  'Boylam',
  'Kaynak',
  "İst. Mesafe",
  'Fay Segmenti',
] as const;

function Row({ event, isNew, compact }: { event: Earthquake; isNew: boolean; compact: boolean }) {
  return (
    <tr
      className={clsx(
        'border-b border-line/60 text-xs transition-colors hover:bg-ink-700/60',
        isNew && 'animate-row-flash',
      )}
    >
      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-txt-soft">
        <Link href={`/earthquakes/${event.id}`} className="hover:text-accent" title={event.occurredAt}>
          {compact ? fmtTime(event.occurredAt) : fmtShort(event.occurredAt)}
        </Link>
      </td>
      <td className="px-3 py-2">
        <span className="flex items-center gap-1.5">
          <MagnitudeBadge magnitude={event.magnitude} />
          <DataClassBadge dataClass={event.dataClass} />
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-txt-soft">{fmtDepth(event.depthKm)}</td>
      <td className="max-w-[260px] px-3 py-2">
        <Link href={`/earthquakes/${event.id}`} className="block truncate text-txt hover:text-accent" title={event.location}>
          {event.location}
        </Link>
      </td>
      {!compact && (
        <>
          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] tabular-nums text-txt-mute">
            {fmtCoord(event.latitude)}
          </td>
          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] tabular-nums text-txt-mute">
            {fmtCoord(event.longitude)}
          </td>
        </>
      )}
      <td className="whitespace-nowrap px-3 py-2">
        <span className="flex items-center gap-1">
          {event.sources.map((s) => (
            <SourceBadge key={`${s.source}-${s.sourceEventId}`} source={s.source} />
          ))}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-txt-soft">{fmtKm(event.istanbulDistanceKm)}</td>
      <td className="max-w-[170px] truncate whitespace-nowrap px-3 py-2 text-txt-mute" title={event.nearestFaultName ?? undefined}>
        {event.nearestFaultName ?? '—'}
        {event.nearestFaultDistanceKm !== null && (
          <span className="text-txt-mute/70"> ({event.nearestFaultDistanceKm.toFixed(1)} km)</span>
        )}
      </td>
    </tr>
  );
}

export function EarthquakeTable({
  events,
  loading = false,
  compact = false,
  emptyMessage = 'Bu zaman aralığında eşleşen deprem bulunamadı.',
}: {
  events: Earthquake[] | undefined;
  loading?: boolean;
  compact?: boolean;
  emptyMessage?: string;
}) {
  const seenIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Flash rows that were not present on the previous render (live inserts).
  useEffect(() => {
    if (!events) return;
    const fresh = new Set<string>();
    for (const e of events) {
      if (seenIds.current.size > 0 && !seenIds.current.has(e.id)) fresh.add(e.id);
      seenIds.current.add(e.id);
    }
    if (seenIds.current.size > 2000) seenIds.current = new Set(events.map((e) => e.id));
    if (fresh.size > 0) {
      setNewIds(fresh);
      const timer = setTimeout(() => setNewIds(new Set()), 2_600);
      return () => clearTimeout(timer);
    }
  }, [events]);

  const headers = compact ? HEADERS.filter((h) => h !== 'Enlem' && h !== 'Boylam') : HEADERS;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">Deprem listesi — zaman, büyüklük, derinlik, konum, kaynak ve fay bilgileri</caption>
        <thead>
          <tr className="border-b border-line-strong text-[10px] uppercase tracking-[0.12em] text-txt-mute">
            {headers.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !events
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-line/60">
                  {headers.map((h) => (
                    <td key={h} className="px-3 py-2.5">
                      <Skeleton className="h-3.5 w-full max-w-[110px]" />
                    </td>
                  ))}
                </tr>
              ))
            : (events ?? []).map((event) => (
                <Row key={event.id} event={event} isNew={newIds.has(event.id)} compact={compact} />
              ))}
        </tbody>
      </table>
      {!loading && events && events.length === 0 && <EmptyState title={emptyMessage} icon="〰" />}
    </div>
  );
}
