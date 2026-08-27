'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataSourceStatus } from '@ils/types';
import { Card, CardHeader, Skeleton, StatusDot } from '@ils/ui';
import { adminMutation, api } from '@/lib/api';
import { relativeTime } from '@/lib/format';

export default function AdminSourcesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['adminSources'],
    queryFn: () => api<DataSourceStatus[]>('/api/admin/sources'),
    refetchInterval: 20_000,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminMutation(`/api/admin/sources/${id}`, 'PATCH', { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminSources'] });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  return (
    <Card>
      <CardHeader title="Veri Kaynakları" subtitle="Bir kaynağı kapatmak yalnızca yeni çekimleri durdurur; mevcut veriler silinmez." />
      {isLoading || !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-line">
          {data.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <StatusDot status={s.status} pulse={s.status === 'ONLINE'} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-txt">
                  {s.name} <span className="ml-1 text-[10px] font-bold tracking-wider text-txt-mute">{s.status}</span>
                </p>
                <p className="text-[11px] text-txt-mute">
                  {s.attribution}
                  {s.url && (
                    <>
                      {' · '}
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {s.url}
                      </a>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-txt-mute">
                  Son başarı: {s.lastSuccessAt ? relativeTime(s.lastSuccessAt) : '—'} · Hata sayısı: {s.errorCount}
                  {s.lastError ? ` · Son hata: ${s.lastError.slice(0, 60)}` : ''}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-txt-soft">
                {s.enabled ? 'Açık' : 'Kapalı'}
                <input
                  type="checkbox"
                  checked={s.enabled}
                  disabled={toggle.isPending}
                  onChange={(e) => toggle.mutate({ id: s.id, enabled: e.target.checked })}
                  className="h-4 w-4 accent-[#22D3EE]"
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
