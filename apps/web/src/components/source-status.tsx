'use client';

import type { SourceHealth } from '@ils/types';
import { Card, CardHeader, Skeleton, StatusDot } from '@ils/ui';
import { relativeTime } from '@/lib/format';
import { useSources } from '@/lib/queries';

const HEALTH_LABEL: Record<SourceHealth, string> = {
  ONLINE: 'ONLINE',
  DEGRADED: 'DEGRADED',
  OFFLINE: 'OFFLINE',
  DISABLED: 'KAPALI',
  UNKNOWN: 'BİLİNMİYOR',
};

/** Data source health strip — the source is never hidden from the user. */
export function SourceStatusPanel({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useSources();
  if (isLoading || !data) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </Card>
    );
  }
  const anyOffline = data.some((s) => s.enabled && s.status === 'OFFLINE');
  return (
    <Card>
      <CardHeader
        title="Veri Kaynakları"
        right={
          anyOffline ? (
            <span className="text-[10px] font-bold text-status-bad">KAYNAK SORUNU</span>
          ) : undefined
        }
      />
      <div className="divide-y divide-line">
        {data.map((source) => (
          <div key={source.id} className="flex items-center gap-3 px-4 py-2.5">
            <StatusDot status={source.status} pulse={source.status === 'ONLINE'} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs font-semibold text-txt">
                {source.name}
                <span
                  className="text-[10px] font-bold tracking-wider"
                  style={{
                    color:
                      source.status === 'ONLINE'
                        ? 'rgb(var(--status-good))'
                        : source.status === 'DEGRADED'
                          ? 'rgb(var(--status-warn))'
                          : source.status === 'OFFLINE'
                            ? 'rgb(var(--status-bad))'
                            : 'rgb(var(--txt-mute))',
                  }}
                >
                  {HEALTH_LABEL[source.status]}
                </span>
              </p>
              {!compact && (
                <p className="truncate text-[10px] text-txt-mute">
                  {source.status === 'OFFLINE' || source.status === 'DEGRADED'
                    ? `Veri kaynağı geçici olarak kullanılamıyor. Son başarılı veri: ${relativeTime(source.lastSuccessAt)}`
                    : `Son senkron: ${relativeTime(source.lastSuccessAt)}${source.latencyMs !== null ? ` · ${source.latencyMs} ms` : ''}`}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
