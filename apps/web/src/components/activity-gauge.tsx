'use client';

import type { ActivitySnapshot } from '@ils/types';
import { ACTIVITY_LEVEL_META, Card, CardHeader, Skeleton } from '@ils/ui';
import { useActivity } from '@/lib/queries';

export function ActivityMini({ snapshot }: { snapshot: ActivitySnapshot }) {
  const meta = ACTIVITY_LEVEL_META[snapshot.level] ?? ACTIVITY_LEVEL_META.LOW!;
  return (
    <div title={snapshot.disclaimer}>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-txt">{Math.round(snapshot.score)}</span>
        <span className="text-[11px] font-bold tracking-wider" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-600" role="presentation">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, snapshot.score)}%`, backgroundColor: meta.color }}
        />
      </div>
      <p className="mt-1 text-[9px] leading-tight text-txt-mute">Tahmin değildir — gözlenen veri.</p>
    </div>
  );
}

function GaugeRow({ snapshot, detailed }: { snapshot: ActivitySnapshot; detailed: boolean }) {
  const meta = ACTIVITY_LEVEL_META[snapshot.level] ?? ACTIVITY_LEVEL_META.LOW!;
  const regionLabel =
    snapshot.region === 'istanbul' ? 'İstanbul' : snapshot.region === 'marmara' ? 'Marmara' : 'Tüm Bölge';
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-txt-soft">{regionLabel}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums text-txt">{Math.round(snapshot.score)}</span>
          <span className="text-[10px] font-bold tracking-wider" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, snapshot.score)}%`, backgroundColor: meta.color }}
        />
      </div>
      {detailed && (
        <div className="mt-2 grid grid-cols-5 gap-1 text-center">
          {(
            [
              ['Sıklık', snapshot.components.frequency],
              ['Büyüklük', snapshot.components.magnitude],
              ['Güncellik', snapshot.components.recency],
              ['Kümelenme', snapshot.components.clustering],
              ['Derinlik', snapshot.components.depth],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded bg-ink-700/70 px-1 py-1">
              <p className="text-[9px] text-txt-mute">{label}</p>
              <p className="text-[11px] font-semibold tabular-nums text-txt-soft">{Math.round(value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full activity panel with the mandatory disclaimer (spec §29).
 * Dashboard shows the calm summary; `detailed` (analytics) adds the
 * five component scores per region.
 */
export function ActivityPanel({ detailed = false }: { detailed?: boolean }) {
  const { data, isLoading } = useActivity();
  return (
    <Card>
      <CardHeader title="Aktivite İndeksi" subtitle="Gözlenen veri analizi — istatistiksel yoğunluk" />
      {isLoading || !data ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="divide-y divide-line">
          {[...data]
            .sort((a, b) => (a.region === 'istanbul' ? -1 : b.region === 'istanbul' ? 1 : a.region.localeCompare(b.region)))
            .map((snap) => (
              <GaugeRow key={snap.region} snapshot={snap} detailed={detailed} />
            ))}
        </div>
      )}
      <p className="border-t border-line px-4 py-2 text-[10px] leading-relaxed text-txt-mute">
        ⚠︎ Bu değer deprem tahmini değildir. Yalnızca gözlenen geçmiş ve mevcut verinin istatistiksel yoğunluğunu
        gösterir.
      </p>
    </Card>
  );
}
