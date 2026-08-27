'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Card, CardHeader, EmptyState, Skeleton } from '@ils/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface LogRow {
  id: string;
  at: string;
  level: string;
  service: string;
  event: string;
  message: string;
}

const LEVELS = ['', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
const LEVEL_COLOR: Record<string, string> = {
  DEBUG: '#64748B',
  INFO: '#34D399',
  WARN: '#FBBF24',
  ERROR: '#F87171',
};

export default function AdminSystemPage() {
  const [level, setLevel] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['adminLogs', level],
    queryFn: () => api<LogRow[]>(`/api/admin/system/events?limit=200${level ? `&level=${level}` : ''}`),
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader
        title="Sistem Olay Günlüğü"
        subtitle="timestamp · level · service · event"
        right={
          <div className="flex gap-1" role="group" aria-label="Log seviyesi">
            {LEVELS.map((l) => (
              <button
                key={l || 'ALL'}
                onClick={() => setLevel(l)}
                className={clsx(
                  'rounded border px-2 py-0.5 text-[10px] font-bold',
                  level === l ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line text-txt-mute hover:bg-ink-700',
                )}
              >
                {l || 'TÜMÜ'}
              </button>
            ))}
          </div>
        }
      />
      {isLoading || !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="Bu seviyede kayıt yok." />
      ) : (
        <div className="max-h-[600px] overflow-auto font-mono text-[11px]">
          {data.map((row) => (
            <div key={row.id} className="flex gap-3 border-b border-line/50 px-4 py-1.5 hover:bg-ink-700/40">
              <span className="shrink-0 tabular-nums text-txt-mute">{fmtDateTime(row.at)}</span>
              <span className="w-12 shrink-0 font-bold" style={{ color: LEVEL_COLOR[row.level] ?? '#94A3B8' }}>
                {row.level}
              </span>
              <span className="w-24 shrink-0 text-txt-mute">{row.service}</span>
              <span className="w-52 shrink-0 truncate text-txt-soft">{row.event}</span>
              <span className="min-w-0 flex-1 truncate text-txt" title={row.message}>
                {row.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
