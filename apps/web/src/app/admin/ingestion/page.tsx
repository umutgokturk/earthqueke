'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IngestionRun } from '@ils/types';
import { Card, CardHeader, Skeleton } from '@ils/ui';
import { adminMutation, api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export default function AdminIngestionPage() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['adminRuns'],
    queryFn: () => api<IngestionRun[]>('/api/admin/ingestion/runs?limit=50'),
    refetchInterval: 15_000,
  });
  const run = useMutation({
    mutationFn: () =>
      adminMutation<{ ok: boolean }>('/api/admin/ingestion/run', 'POST', source ? { source } : {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminRuns'] }),
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <label className="flex items-center gap-2 text-xs text-txt-soft">
          Kaynak
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-md border border-line bg-ink-800 px-2 py-1.5 text-xs text-txt focus:border-accent/60 focus:outline-none"
          >
            <option value="">Tümü</option>
            <option value="AFAD">AFAD</option>
            <option value="KANDILLI">KANDİLLİ</option>
            <option value="MOCK">MOCK</option>
          </select>
        </label>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="rounded-md border border-accent/60 bg-accent-soft px-4 py-2 text-xs font-bold text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {run.isPending ? 'Çalışıyor…' : '▶ Şimdi çalıştır'}
        </button>
        {run.isError && (
          <p className="text-xs text-status-bad">
            {run.error instanceof ApiError ? run.error.message : 'Tetikleme başarısız.'}
          </p>
        )}
        {run.isSuccess && <p className="text-xs text-status-good">Tetiklendi.</p>}
      </Card>

      <Card>
        <CardHeader title="Çalıştırma Geçmişi" subtitle="fetch → parse → validate → dedupe → db → spatial → cache → broadcast" />
        {isLoading || !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-line-strong text-[10px] uppercase tracking-widest text-txt-mute">
                  <th className="px-3 py-2">Başlangıç</th>
                  <th className="px-3 py-2">Kaynak</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Alınan</th>
                  <th className="px-3 py-2">Yeni</th>
                  <th className="px-3 py-2">Güncellenen</th>
                  <th className="px-3 py-2">Birleşen</th>
                  <th className="px-3 py-2">Geçersiz</th>
                  <th className="px-3 py-2">Hata</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-ink-700/50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-txt-mute">
                      {fmtDateTime(r.startedAt)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-txt">{r.source}</td>
                    <td
                      className="px-3 py-2 font-bold"
                      style={{
                        color:
                          r.status === 'SUCCESS' ? '#34D399' : r.status === 'ERROR' ? '#F87171' : '#FBBF24',
                      }}
                    >
                      {r.status}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{r.fetched}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{r.inserted}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{r.updated}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{r.merged}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{r.invalid}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-txt-mute" title={r.error ?? undefined}>
                      {r.error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
