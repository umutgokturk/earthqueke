'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, Skeleton, StatusDot } from '@ils/ui';
import { fmtTime, relativeTime } from '@/lib/format';
import { useSources, useSystemStatus } from '@/lib/queries';
import { useLiveStore } from '@/stores/live-store';

function StatusCard({
  name,
  ok,
  statusText,
  lines,
}: {
  name: string;
  ok: boolean | 'warn';
  statusText: string;
  lines: Array<[string, string]>;
}) {
  const status = ok === true ? 'ONLINE' : ok === 'warn' ? 'DEGRADED' : 'OFFLINE';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <StatusDot status={status} pulse={ok === true} />
        <p className="text-sm font-bold text-txt">{name}</p>
        <span
          className="ml-auto text-[10px] font-bold tracking-widest"
          style={{ color: ok === true ? '#34D399' : ok === 'warn' ? '#FBBF24' : '#F87171' }}
        >
          {statusText}
        </span>
      </div>
      <dl className="mt-3 space-y-1">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <dt className="text-txt-mute">{k}</dt>
            <dd className="tabular-nums text-txt-soft">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function ApiStatusClient() {
  const { data: system, isLoading } = useSystemStatus();
  const { data: sources } = useSources();
  const connection = useLiveStore((s) => s.connection);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const measure = async () => {
      const t0 = performance.now();
      try {
        await fetch('/api/system/status', { cache: 'no-store' });
        if (!cancelled) setLatency(Math.round(performance.now() - t0));
      } catch {
        if (!cancelled) setLatency(null);
      }
    };
    void measure();
    const timer = setInterval(() => void measure(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (isLoading || !system) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">API DURUMU</h1>
        <p className="text-[11px] text-txt-mute">
          Sunucu zamanı: {fmtTime(system.time)} (TSİ) · Sürüm {system.version} · Ortam {system.environment} · Uptime{' '}
          {Math.floor(system.uptimeSeconds / 60)} dk
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(sources ?? []).map((s) => (
          <StatusCard
            key={s.id}
            name={s.name}
            ok={s.status === 'ONLINE' ? true : s.status === 'DEGRADED' ? 'warn' : false}
            statusText={s.status}
            lines={[
              ['Latency', s.latencyMs !== null ? `${s.latencyMs} ms` : '—'],
              ['Last successful sync', s.lastSuccessAt ? `${fmtTime(s.lastSuccessAt)} (${relativeTime(s.lastSuccessAt)})` : '—'],
              ['Error count', String(s.errorCount)],
              ['Son hata', s.lastError ? s.lastError.slice(0, 40) : '—'],
            ]}
          />
        ))}

        <StatusCard
          name="Database"
          ok={system.database.ok}
          statusText={system.database.ok ? 'ONLINE' : 'OFFLINE'}
          lines={[
            ['Mod', system.database.mode === 'postgres' ? 'PostgreSQL + PostGIS' : 'In-memory (dev fallback)'],
            ['Latency', system.database.latencyMs !== null ? `${system.database.latencyMs} ms` : '—'],
          ]}
        />
        <StatusCard
          name="Redis"
          ok={system.cache.mode === 'redis' ? system.cache.ok : 'warn'}
          statusText={system.cache.mode === 'redis' ? (system.cache.ok ? 'ONLINE' : 'OFFLINE') : 'MEMORY FALLBACK'}
          lines={[['Mod', system.cache.mode === 'redis' ? 'Redis cache + rate limit' : 'In-memory cache (dev fallback)']]}
        />
        <StatusCard
          name="WebSocket"
          ok={connection === 'open' ? true : connection === 'polling' ? 'warn' : false}
          statusText={connection === 'open' ? 'ONLINE' : connection === 'polling' ? 'POLLING FALLBACK' : 'BAĞLANIYOR'}
          lines={[
            ['Bağlı istemci', String(system.websocket.clients)],
            ['Bu tarayıcı', connection],
          ]}
        />
        <StatusCard
          name="REST API"
          ok={latency !== null}
          statusText={latency !== null ? 'ONLINE' : 'ERİŞİLEMİYOR'}
          lines={[
            ['Tarayıcı → API latency', latency !== null ? `${latency} ms` : '—'],
            ['Ingestion modu', system.ingestion.mode],
            ['Son ingestion', system.ingestion.lastRunAt ? relativeTime(system.ingestion.lastRunAt) : '—'],
          ]}
        />
      </div>

      <p className="text-[11px] text-txt-mute">
        Bir kaynak OFFLINE olduğunda diğer kaynaklar çalışmaya devam eder; arayüz son başarılı verinin yaşını
        gösterir.
      </p>
    </div>
  );
}
