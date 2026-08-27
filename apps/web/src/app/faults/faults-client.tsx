'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import type { TimelineBucket } from '@ils/types';
import { Card, CardHeader, Skeleton } from '@ils/ui';
import { api } from '@/lib/api';
import { ChartCard, DistBarChart, TimelineChart } from '@/components/charts';
import { EarthquakeTable } from '@/components/earthquake-table';
import { EarthquakeMap } from '@/components/map/earthquake-map';
import { fmtDateTime } from '@/lib/format';
import {
  useDistribution,
  useFaultDetail,
  useFaultEarthquakes,
  useFaults,
  useFaultStats,
  useTimeline,
} from '@/lib/queries';

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line/70 bg-ink-700/50 px-3 py-2 text-center">
      <p className="text-[9px] uppercase tracking-widest text-txt-mute">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-txt">{value}</p>
    </div>
  );
}

export function FaultsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get('fault') ?? 'kumburgaz-segmenti';

  const { data: faults, isLoading: faultsLoading } = useFaults();
  const { data: stats } = useFaultStats();
  const { data: detail, isLoading: detailLoading } = useFaultDetail(selected);
  const { data: quakes, isLoading: quakesLoading } = useFaultEarthquakes(selected, '7d');
  const faultDist = useDistribution('fault', '30d');
  const fault = faults?.find((f) => f.slug === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">FAY SEGMENTLERİ</h1>
        <p className="text-[11px] text-status-warn">
          ⚠ Geometriler yaklaşık/basitleştirilmiş sayısallaştırmadır; bilimsel kullanım için MTA/AFAD kaynaklarına
          başvurun.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Segmentler" subtitle="Seçmek için tıklayın" />
          {faultsLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {(faults ?? [])
                .filter((f) => !f.isZone)
                .map((f) => {
                  const s = stats?.find((x) => x.slug === f.slug);
                  return (
                    <li key={f.id}>
                      <button
                        onClick={() => router.replace(`/faults?fault=${f.slug}`, { scroll: false })}
                        aria-pressed={selected === f.slug}
                        className={clsx(
                          'flex w-full items-center justify-between px-4 py-2.5 text-left text-xs transition-colors',
                          selected === f.slug ? 'bg-accent-soft text-accent' : 'text-txt-soft hover:bg-ink-700',
                        )}
                      >
                        <span className="font-semibold">{f.name}</span>
                        <span className="tabular-nums text-txt-mute">{s ? `${s.counts.d30} olay/30g` : ''}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          <div className="border-t border-line p-3 text-[10px] leading-relaxed text-txt-mute">
            {fault ? (
              <>
                <p className="mb-1 text-txt-soft">{fault.description}</p>
                <p>Tür: {fault.segmentType}</p>
                <p className="mt-1">Kaynak: {fault.source}</p>
                {fault.sourceUrl && (
                  <a href={fault.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {fault.sourceUrl}
                  </a>
                )}
                <p className="mt-1">Lisans: {fault.license}</p>
                <p>
                  Son doğrulama: {fault.lastVerified ?? 'doğrulanmadı (yaklaşık geometri)'} · Güncellendi:{' '}
                  {fmtDateTime(fault.updatedAt)}
                </p>
              </>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <EarthquakeMap className="h-[320px]" showControls={false} showLegend={false} />

          <Card>
            <CardHeader title={detail?.name ?? 'Segment İstatistikleri'} subtitle="İlişkilendirme: en yakın segment ≤ 10 km" />
            {detailLoading || !detail ? (
              <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-6">
                <StatBox label="Son 24 saat" value={detail.counts.h24} />
                <StatBox label="Son 7 gün" value={detail.counts.d7} />
                <StatBox label="Son 30 gün" value={detail.counts.d30} />
                <StatBox label="Maksimum" value={detail.maxMagnitude !== null ? `M${detail.maxMagnitude.toFixed(1)}` : '—'} />
                <StatBox label="Ortalama" value={detail.avgMagnitude !== null ? `M${detail.avgMagnitude.toFixed(1)}` : '—'} />
                <StatBox label="Ort. derinlik" value={detail.avgDepthKm !== null ? `${detail.avgDepthKm.toFixed(1)} km` : '—'} />
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FaultTimeline slug={selected} />
        <ChartCard
          title="Segmentlere Göre Dağılım (30 gün)"
          loading={faultDist.isLoading}
          empty={(faultDist.data ?? []).length === 0}
          height={280}
        >
          <DistBarChart data={faultDist.data ?? []} layout="horizontal" height={260} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="Segmentle İlişkili Depremler" subtitle="Son 7 gün" />
        <EarthquakeTable events={quakes?.items} loading={quakesLoading} compact />
      </Card>
    </div>
  );
}

function FaultTimeline({ slug }: { slug: string }) {
  const { data, isLoading } = useTimelineForFault(slug);
  return (
    <ChartCard
      title="Segment Zaman Serisi"
      subtitle="Son 7 gün, 6 saatlik kovalar"
      loading={isLoading}
      empty={(data ?? []).every((b) => b.count === 0)}
      height={280}
    >
      <TimelineChart data={data ?? []} range="7d" height={260} showMax />
    </ChartCard>
  );
}

/** Fault-scoped timeline aggregated client-side from the segment's events. */
function useTimelineForFault(slug: string) {
  return useQuery({
    queryKey: ['faultTimeline', slug],
    queryFn: async () => {
      const page = await api<{ items: Array<{ occurredAt: string; magnitude: number; depthKm: number }> }>(
        `/api/faults/${slug}/earthquakes?range=7d&limit=500`,
      );
      const bucketMs = 6 * 3_600_000;
      const now = Date.now();
      const from = now - 7 * 86_400_000;
      const sparse = new Map<number, { count: number; max: number; sumM: number; sumD: number }>();
      for (const e of page.items) {
        const key = Math.floor(Date.parse(e.occurredAt) / bucketMs) * bucketMs;
        const b = sparse.get(key) ?? { count: 0, max: 0, sumM: 0, sumD: 0 };
        b.count += 1;
        b.max = Math.max(b.max, e.magnitude);
        b.sumM += e.magnitude;
        b.sumD += e.depthKm;
        sparse.set(key, b);
      }
      const out: TimelineBucket[] = [];
      for (let t = Math.floor(from / bucketMs) * bucketMs; t <= now; t += bucketMs) {
        const b = sparse.get(t);
        out.push({
          t: new Date(t).toISOString(),
          count: b?.count ?? 0,
          maxMagnitude: b && b.count ? b.max : null,
          avgMagnitude: b && b.count ? b.sumM / b.count : null,
          avgDepthKm: b && b.count ? b.sumD / b.count : null,
        });
      }
      return out;
    },
  });
}
