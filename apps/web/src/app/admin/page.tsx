'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, DataSourceStatus, IngestionRun } from '@ils/types';
import { Card, CardHeader, Skeleton, StatusDot } from '@ils/ui';
import { api } from '@/lib/api';
import { fmtTime, relativeTime } from '@/lib/format';

interface Overview {
  stats: DashboardStats;
  sources: DataSourceStatus[];
  runs: IngestionRun[];
  database: { mode: string; ok: boolean; latencyMs: number | null };
  cache: { mode: string; ok: boolean };
  websocketClients: number;
  ingestionMode: string;
  environment: string;
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['adminOverview'],
    queryFn: () => api<Overview>('/api/admin/overview'),
    refetchInterval: 20_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  const kpis: Array<[string, React.ReactNode, string?]> = [
    ['Son 24 saat', data.stats.counts.h24, 'deprem'],
    ['Son 30 gün', data.stats.counts.d30, 'deprem'],
    ['WebSocket istemci', data.websocketClients],
    ['Ingestion modu', data.ingestionMode, data.environment],
    ['Veritabanı', data.database.mode, data.database.ok ? `OK · ${data.database.latencyMs ?? '—'} ms` : 'ERİŞİLEMİYOR'],
    ['Cache', data.cache.mode, data.cache.ok ? 'OK' : 'ERİŞİLEMİYOR'],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value, hint]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-txt">{value}</p>
            {hint && <p className="text-[10px] text-txt-mute">{hint}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Kaynak Durumu" />
          <div className="divide-y divide-line">
            {data.sources.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <StatusDot status={s.status} />
                <span className="font-semibold text-txt">{s.name}</span>
                <span className="text-txt-mute">{s.status}</span>
                <span className="ml-auto tabular-nums text-txt-mute">
                  {s.lastSuccessAt ? relativeTime(s.lastSuccessAt) : '—'}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Son Ingestion Çalıştırmaları" />
          <div className="divide-y divide-line">
            {data.runs.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span
                  className="w-16 font-bold"
                  style={{ color: r.status === 'SUCCESS' ? '#34D399' : r.status === 'ERROR' ? '#F87171' : '#FBBF24' }}
                >
                  {r.status}
                </span>
                <span className="w-20 font-semibold text-txt">{r.source}</span>
                <span className="tabular-nums text-txt-mute">{fmtTime(r.startedAt)}</span>
                <span className="ml-auto tabular-nums text-txt-soft">
                  {r.fetched} alındı · {r.inserted} yeni · {r.merged} birleşti
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
