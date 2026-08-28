'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type { TimeRange } from '@ils/types';
import { ActivityPanel } from '@/components/activity-gauge';
import {
  ActivityTimelineChart,
  ChartCard,
  DistBarChart,
  MagDepthScatter,
  TimeMagScatter,
  TimelineChart,
} from '@/components/charts';
import {
  useActivityTimeline,
  useDistribution,
  useDistrictStats,
  useFaultStats,
  useScatter,
  useTimeline,
} from '@/lib/queries';

const TABS = ['Aktivite', 'Büyüklük', 'Derinlik', 'Zaman', 'Fay', 'İlçe'] as const;
type Tab = (typeof TABS)[number];

function RangePicker({ value, onChange }: { value: TimeRange; onChange(r: TimeRange): void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Zaman aralığı">
      {(['1h', '6h', '24h', '7d', '30d'] as TimeRange[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={clsx(
            'rounded border px-2 py-0.5 text-[10px] font-bold',
            value === r ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line text-txt-mute hover:bg-ink-700',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsClient() {
  const [tab, setTab] = useState<Tab>('Aktivite');
  const [range, setRange] = useState<TimeRange>('7d');

  const timeline = useTimeline(range);
  const timeline24 = useTimeline('24h');
  const magDist = useDistribution('magnitude', range);
  const depthDist = useDistribution('depth', range);
  const hourDist = useDistribution('hour', range);
  const dayDist = useDistribution('day', '30d');
  const faultDist = useDistribution('fault', range);
  const districtDist = useDistribution('district', range);
  const scatter = useScatter(range);
  const activityTl = useActivityTimeline('marmara', range === '1h' || range === '6h' ? '24h' : range);
  const faultStats = useFaultStats();
  const districtStats = useDistrictStats();

  const scatterEmpty = (scatter.data ?? []).length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">ANALİTİK DASHBOARD</h1>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Analiz sekmeleri">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              'rounded-t-md px-4 py-2 text-[11px] font-bold tracking-widest',
              tab === t
                ? 'border border-b-0 border-line bg-ink-800 text-accent'
                : 'text-txt-mute hover:text-txt-soft',
            )}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'Aktivite' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Deprem Yoğunluğu"
            subtitle={`Seçili aralık: ${range} — deprem sayısı + maksimum büyüklük`}
            loading={timeline.isLoading}
            empty={(timeline.data ?? []).every((b) => b.count === 0)}
          >
            <TimelineChart data={timeline.data ?? []} range={range} height={230} />
          </ChartCard>
          <ChartCard
            title="Son 24 Saat Yoğunluğu"
            subtitle="Saatlik kovalar"
            loading={timeline24.isLoading}
            empty={(timeline24.data ?? []).every((b) => b.count === 0)}
          >
            <TimelineChart data={timeline24.data ?? []} range="24h" height={230} showMax={false} />
          </ChartCard>
          <ChartCard
            title="Aktivite İndeksi Zaman Serisi"
            subtitle="Marmara bölgesi — gözlemsel istatistik, tahmin değildir"
            loading={activityTl.isLoading}
            empty={(activityTl.data ?? []).length === 0}
            emptyMessage="Henüz yeterli indeks geçmişi birikmedi."
          >
            <ActivityTimelineChart data={activityTl.data ?? []} height={230} />
          </ChartCard>
          <ActivityPanel detailed />
        </div>
      )}

      {tab === 'Büyüklük' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Magnitude Dağılımı"
            subtitle="Bin başına deprem sayısı"
            loading={magDist.isLoading}
            empty={(magDist.data ?? []).every((b) => b.count === 0)}
          >
            <DistBarChart data={magDist.data ?? []} height={230} />
          </ChartCard>
          <ChartCard
            title="Zaman – Magnitude"
            subtitle="Her nokta bir deprem; boyut büyüklükle ölçekli"
            loading={scatter.isLoading}
            empty={scatterEmpty}
          >
            <TimeMagScatter data={scatter.data ?? []} height={230} />
          </ChartCard>
        </div>
      )}

      {tab === 'Derinlik' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Derinlik Dağılımı"
            subtitle="Bin başına deprem sayısı"
            loading={depthDist.isLoading}
            empty={(depthDist.data ?? []).every((b) => b.count === 0)}
          >
            <DistBarChart data={depthDist.data ?? []} height={230} />
          </ChartCard>
          <ChartCard
            title="Magnitude – Derinlik"
            subtitle="Sığ olaylar üstte; boyut büyüklükle ölçekli"
            loading={scatter.isLoading}
            empty={scatterEmpty}
          >
            <MagDepthScatter data={scatter.data ?? []} height={230} />
          </ChartCard>
        </div>
      )}

      {tab === 'Zaman' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Saatlik Aktivite Profili"
            subtitle="Europe/Istanbul saat dilimi, 0–23"
            loading={hourDist.isLoading}
            empty={(hourDist.data ?? []).every((b) => b.count === 0)}
          >
            <DistBarChart data={hourDist.data ?? []} height={230} />
          </ChartCard>
          <ChartCard
            title="Günlük Aktivite"
            subtitle="Son 30 gün"
            loading={dayDist.isLoading}
            empty={(dayDist.data ?? []).every((b) => b.count === 0)}
          >
            <DistBarChart data={dayDist.data ?? []} height={230} />
          </ChartCard>
        </div>
      )}

      {tab === 'Fay' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Fay Segmentlerine Göre Dağılım"
            subtitle="İlişkilendirme: en yakın segment ≤ 10 km (yaklaşık geometri)"
            loading={faultDist.isLoading}
            empty={(faultDist.data ?? []).length === 0}
            height={300}
          >
            <DistBarChart data={faultDist.data ?? []} layout="horizontal" height={280} />
          </ChartCard>
          <div className="overflow-x-auto rounded-lg border border-line bg-ink-800/80">
            <table className="w-full min-w-[520px] text-left text-xs">
              <caption className="sr-only">Fay segmenti istatistikleri</caption>
              <thead>
                <tr className="border-b border-line-strong text-[10px] uppercase tracking-widest text-txt-mute">
                  <th className="px-3 py-2">Segment</th>
                  <th className="px-3 py-2">24s</th>
                  <th className="px-3 py-2">7g</th>
                  <th className="px-3 py-2">30g</th>
                  <th className="px-3 py-2">Maks</th>
                  <th className="px-3 py-2">Ort</th>
                  <th className="px-3 py-2">Ort. Derinlik</th>
                </tr>
              </thead>
              <tbody>
                {(faultStats.data ?? []).map((f) => (
                  <tr key={f.faultId} className="border-b border-line/60 hover:bg-ink-700/50">
                    <td className="px-3 py-2 font-medium text-txt">{f.name}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{f.counts.h24}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{f.counts.d7}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">{f.counts.d30}</td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">
                      {f.maxMagnitude !== null ? `M${f.maxMagnitude.toFixed(1)}` : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">
                      {f.avgMagnitude !== null ? `M${f.avgMagnitude.toFixed(1)}` : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-txt-soft">
                      {f.avgDepthKm !== null ? `${f.avgDepthKm.toFixed(1)} km` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'İlçe' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="İstanbul İlçelerine Göre Dağılım"
            subtitle="Yaklaşık merkez-yarıçap sınıflandırması"
            loading={districtDist.isLoading}
            empty={(districtDist.data ?? []).length === 0}
            height={340}
            emptyMessage="Bu aralıkta ilçe içinde sınıflandırılan deprem yok."
          >
            <DistBarChart data={(districtDist.data ?? []).slice(0, 12)} layout="horizontal" height={320} />
          </ChartCard>
          <div className="overflow-x-auto rounded-lg border border-line bg-ink-800/80">
            <table className="w-full min-w-[480px] text-left text-xs">
              <caption className="sr-only">İlçe istatistikleri</caption>
              <thead>
                <tr className="border-b border-line-strong text-[10px] uppercase tracking-widest text-txt-mute">
                  <th className="px-3 py-2">İlçe</th>
                  <th className="px-3 py-2">24s</th>
                  <th className="px-3 py-2">7g</th>
                  <th className="px-3 py-2">30g</th>
                  <th className="px-3 py-2">Maks</th>
                  <th className="px-3 py-2">Ort</th>
                </tr>
              </thead>
              <tbody>
                {(districtStats.data ?? [])
                  .filter((d) => d.counts.d30 > 0)
                  .slice(0, 15)
                  .map((d) => (
                    <tr key={d.slug} className="border-b border-line/60 hover:bg-ink-700/50">
                      <td className="px-3 py-2 font-medium text-txt">{d.name}</td>
                      <td className="px-3 py-2 tabular-nums text-txt-soft">{d.counts.h24}</td>
                      <td className="px-3 py-2 tabular-nums text-txt-soft">{d.counts.d7}</td>
                      <td className="px-3 py-2 tabular-nums text-txt-soft">{d.counts.d30}</td>
                      <td className="px-3 py-2 tabular-nums text-txt-soft">
                        {d.maxMagnitude !== null ? `M${d.maxMagnitude.toFixed(1)}` : '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-txt-soft">
                        {d.avgMagnitude !== null ? `M${d.avgMagnitude.toFixed(1)}` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-txt-mute">
              İlçe ataması yaklaşık merkez/yarıçap yöntemiyle yapılır; istatistiksel kümelenme gösterir, resmî sınır
              analizi değildir.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
