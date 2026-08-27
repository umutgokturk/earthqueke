'use client';

import { useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { Card, CardHeader, EmptyState, MagnitudeBadge } from '@ils/ui';
import { ChartCard, TimelineChart } from '@/components/charts';
import { EarthquakeTable } from '@/components/earthquake-table';
import { LiveIndicator } from '@/components/live-indicator';
import { EarthquakeMap } from '@/components/map/earthquake-map';
import { fmtDepth, fmtTime } from '@/lib/format';
import { useLatest, useTimeline } from '@/lib/queries';
import { useLiveStore } from '@/stores/live-store';

function LiveFeed() {
  const feed = useLiveStore((s) => s.feed);
  if (feed.length === 0) {
    return <EmptyState title="Henüz canlı olay yok" hint="Yeni depremler geldiğinde burada akacak." icon="⚡" />;
  }
  return (
    <ol className="max-h-full space-y-1.5 overflow-y-auto p-3">
      {feed.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-2 rounded-md border border-line/70 bg-ink-700/60 px-2.5 py-2"
        >
          <MagnitudeBadge magnitude={item.event.magnitude} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-txt">{item.event.location}</p>
            <p className="text-[10px] text-txt-mute">
              {fmtTime(item.event.occurredAt)} · {fmtDepth(item.event.depthKm)} · {item.event.source}
              {item.kind === 'updated' && <span className="ml-1 text-status-warn">güncellendi</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LiveControls() {
  const paused = useLiveStore((s) => s.paused);
  const setPaused = useLiveStore((s) => s.setPaused);
  const muted = useLiveStore((s) => s.muted);
  const setMuted = useLiveStore((s) => s.setMuted);

  const fullscreen = useCallback(() => {
    const el = document.getElementById('live-root');
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  }, []);

  const btn =
    'rounded-md border px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setPaused(!paused)}
        aria-pressed={paused}
        className={clsx(btn, paused ? 'border-status-warn/60 bg-status-warn/10 text-status-warn' : 'border-line text-txt-soft hover:bg-ink-700')}
      >
        {paused ? '▶ RESUME' : '⏸ PAUSE FEED'}
      </button>
      <button
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
        className={clsx(btn, muted ? 'border-status-warn/60 text-status-warn' : 'border-line text-txt-soft hover:bg-ink-700')}
      >
        {muted ? '🔇 MUTED' : '🔊 MUTE'}
      </button>
      <button onClick={fullscreen} className={clsx(btn, 'border-line text-txt-soft hover:bg-ink-700')}>
        ⛶ FULLSCREEN
      </button>
    </div>
  );
}

/** Full-screen operations mode (spec §74–75). */
export function LiveClient() {
  const { data: latest, isLoading } = useLatest(25);
  const { data: timeline } = useTimeline('6h');
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div id="live-root" ref={rootRef} className="space-y-3 bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">LIVE OPERASYON MODU</h1>
          <LiveIndicator />
        </div>
        <LiveControls />
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Card className="order-2 lg:order-1">
          <CardHeader title="Live Earthquakes" subtitle="En son kayıtlar" />
          <div className="max-h-[460px] overflow-y-auto">
            <table className="w-full text-left">
              <tbody>
                {(latest ?? []).slice(0, 18).map((e) => (
                  <tr key={e.id} className="border-b border-line/50 text-xs hover:bg-ink-700/50">
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-txt-mute">{fmtTime(e.occurredAt)}</td>
                    <td className="px-2 py-2">
                      <MagnitudeBadge magnitude={e.magnitude} />
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-2 text-txt-soft" title={e.location}>
                      {e.location}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="order-1 lg:order-2 lg:col-span-2">
          <EarthquakeMap className="h-[380px] lg:h-[520px]" showControls={false} showLegend={false} />
        </div>

        <Card className="order-3 flex max-h-[520px] flex-col">
          <CardHeader title="Live Feed" subtitle="WebSocket akışı" />
          <div className="min-h-0 flex-1 overflow-hidden">
            <LiveFeed />
          </div>
        </Card>
      </div>

      <ChartCard
        title="Real-Time Activity"
        subtitle="Son 6 saat, 15 dakikalık kovalar"
        loading={!timeline}
        height={190}
      >
        <TimelineChart data={timeline ?? []} range="6h" height={180} showMax={false} />
      </ChartCard>

      {isLoading && <p className="text-center text-xs text-txt-mute">Veriler yükleniyor…</p>}
    </div>
  );
}
