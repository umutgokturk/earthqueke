'use client';

import { useEffect, useState } from 'react';
import { FRESHNESS } from '@ils/config';
import { useLiveStore } from '@/stores/live-store';

/**
 * Data freshness (spec §76): ● LIVE (<60 s) → ● DELAYED (<5 min) → ● STALE.
 * The dot reflects seconds since the last server signal; connection mode is
 * shown alongside when we are on the polling fallback.
 */
export function LiveIndicator({ compact = false }: { compact?: boolean }) {
  const lastMessageAt = useLiveStore((s) => s.lastMessageAt);
  const connection = useLiveStore((s) => s.connection);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((v) => v + 1), 1_000);
    return () => clearInterval(timer);
  }, []);

  const seconds = lastMessageAt === null ? null : Math.round((Date.now() - lastMessageAt) / 1000);
  const state =
    seconds === null
      ? 'CONNECTING'
      : seconds <= FRESHNESS.liveMaxSeconds
        ? 'LIVE'
        : seconds <= FRESHNESS.delayedMaxSeconds
          ? 'DELAYED'
          : 'STALE';

  const color = state === 'LIVE' ? '#34D399' : state === 'DELAYED' ? '#FBBF24' : state === 'STALE' ? '#F87171' : '#64748B';
  const label =
    seconds === null
      ? 'bağlanıyor…'
      : seconds < 60
        ? `${seconds} sn önce güncellendi`
        : `${Math.floor(seconds / 60)} dk önce güncellendi`;

  return (
    <div className="flex items-center gap-2" title={connection === 'polling' ? 'WebSocket kapalı — 30 sn polling modunda' : undefined}>
      <span
        aria-hidden
        className="h-2 w-2 animate-pulse-dot rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="text-[11px] font-bold tracking-[0.18em]" style={{ color }}>
        {state}
      </span>
      {!compact && (
        <span className="hidden text-[11px] text-txt-mute sm:inline">
          {connection === 'polling' ? 'polling · ' : ''}
          {label}
        </span>
      )}
    </div>
  );
}
