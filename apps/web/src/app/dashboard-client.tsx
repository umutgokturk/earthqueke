'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@ils/ui';
import { ActivityPanel } from '@/components/activity-gauge';
import { ChartCard, TimelineChart } from '@/components/charts';
import { EarthquakeTable } from '@/components/earthquake-table';
import { KpiCards } from '@/components/kpi-cards';
import { EarthquakeMap } from '@/components/map/earthquake-map';
import { SourceStatusPanel } from '@/components/source-status';
import { useLatest, useTimeline } from '@/lib/queries';

export function DashboardClient() {
  const { data: latest, isLoading: latestLoading } = useLatest(15);
  const { data: timeline, isLoading: timelineLoading } = useTimeline('24h');

  return (
    <div className="space-y-4">
      <KpiCards />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <EarthquakeMap className="h-[380px] sm:h-[460px]" showLegend={false} />
        </div>
        <div className="space-y-4">
          <ActivityPanel />
          <SourceStatusPanel compact />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Canlı Deprem Tablosu"
            subtitle="Yeni kayıtlar geldiğinde satır vurgulanır"
            right={
              <Link href="/earthquakes" className="text-[11px] font-semibold text-accent hover:underline">
                Tümü →
              </Link>
            }
          />
          <EarthquakeTable events={latest} loading={latestLoading} compact />
        </Card>
        <ChartCard
          title="Son 24 Saat Yoğunluğu"
          subtitle="Saatlik deprem sayısı ve maksimum büyüklük"
          loading={timelineLoading}
          empty={(timeline ?? []).every((b) => b.count === 0)}
          height={420}
        >
          <TimelineChart data={timeline ?? []} range="24h" height={410} />
        </ChartCard>
      </div>
    </div>
  );
}
