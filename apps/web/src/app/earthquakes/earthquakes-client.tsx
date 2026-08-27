'use client';

import { Card, CardHeader, MagnitudeLegend } from '@ils/ui';
import { EarthquakeTable } from '@/components/earthquake-table';
import { FilterBar, useUrlFilters } from '@/components/filter-bar';
import { qs } from '@/lib/api';
import { useEarthquakes } from '@/lib/queries';

const PAGE_SIZE = 50;

export function EarthquakesClient() {
  const { filters, set } = useUrlFilters({ range: '24h' });
  const { data, isLoading, isFetching } = useEarthquakes({
    range: filters.range,
    minMagnitude: filters.minMagnitude,
    minDepth: filters.minDepth,
    maxDepth: filters.maxDepth,
    source: filters.source,
    region: filters.region,
    limit: PAGE_SIZE,
    offset: (filters.page - 1) * PAGE_SIZE,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const exportUrl = `/api/earthquakes/export${qs({
    range: filters.range,
    minMagnitude: filters.minMagnitude,
    minDepth: filters.minDepth,
    maxDepth: filters.maxDepth,
    source: filters.source,
    region: filters.region,
  })}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">DEPREMLER</h1>
        <MagnitudeLegend />
      </div>

      <FilterBar filters={filters} set={set} />

      <Card>
        <CardHeader
          title={`Sonuçlar${data ? ` · ${data.total} kayıt` : ''}`}
          subtitle={isFetching && !isLoading ? 'Güncelleniyor…' : undefined}
          right={
            <a
              href={exportUrl}
              className="rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold text-txt-soft hover:bg-ink-700 hover:text-txt"
              download
            >
              ⬇ Export CSV
            </a>
          }
        />
        <EarthquakeTable events={data?.items} loading={isLoading} />
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-txt-soft">
            <button
              disabled={filters.page <= 1}
              onClick={() => set({ page: filters.page - 1 })}
              className="rounded-md border border-line px-3 py-1 font-semibold disabled:opacity-40"
            >
              ← Önceki
            </button>
            <span className="tabular-nums">
              Sayfa {filters.page} / {totalPages}
            </span>
            <button
              disabled={filters.page >= totalPages}
              onClick={() => set({ page: filters.page + 1 })}
              className="rounded-md border border-line px-3 py-1 font-semibold disabled:opacity-40"
            >
              Sonraki →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
