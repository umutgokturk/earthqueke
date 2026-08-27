'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { clsx } from 'clsx';
import type { TimeRange } from '@ils/types';
import { useRegions } from '@/lib/queries';

export interface UrlFilters {
  range: TimeRange;
  minMagnitude?: number;
  minDepth?: number;
  maxDepth?: number;
  source?: string;
  region?: string;
  page: number;
}

/** URL query <-> filter state (spec §9): /earthquakes?range=24h&minMagnitude=2&source=AFAD */
export function useUrlFilters(defaults: Partial<UrlFilters> = {}): {
  filters: UrlFilters;
  set(patch: Partial<Record<string, string | number | undefined>>): void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters: UrlFilters = {
    range: (params.get('range') as TimeRange) ?? defaults.range ?? '24h',
    minMagnitude: params.get('minMagnitude') ? Number(params.get('minMagnitude')) : undefined,
    minDepth: params.get('minDepth') ? Number(params.get('minDepth')) : undefined,
    maxDepth: params.get('maxDepth') ? Number(params.get('maxDepth')) : undefined,
    source: params.get('source') ?? undefined,
    region: params.get('region') ?? undefined,
    page: params.get('page') ? Math.max(1, Number(params.get('page'))) : 1,
  };

  const set = useCallback(
    (patch: Partial<Record<string, string | number | undefined>>) => {
      const next = new URLSearchParams(params.toString());
      if (!('page' in patch)) next.delete('page'); // filter changes reset pagination
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '' || value === null) next.delete(key);
        else next.set(key, String(value));
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { filters, set };
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        active ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line text-txt-soft hover:bg-ink-700',
      )}
    >
      {children}
    </button>
  );
}

const DEPTH_OPTIONS = [
  { label: 'Tümü', min: undefined, max: undefined },
  { label: '0–5 km', min: 0, max: 5 },
  { label: '5–10 km', min: 5, max: 10 },
  { label: '10–20 km', min: 10, max: 20 },
  { label: '20+ km', min: 20, max: undefined },
] as const;

const PRIORITY_REGIONS = ['istanbul', 'marmara', 'adalar', 'silivri', 'catalca', 'buyukcekmece', 'avcilar'];

export function FilterBar({
  filters,
  set,
  showMock = true,
}: {
  filters: UrlFilters;
  set(patch: Partial<Record<string, string | number | undefined>>): void;
  showMock?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: regions } = useRegions();

  const priority = PRIORITY_REGIONS.map((slug) => regions?.find((r) => r.slug === slug)).filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );
  const others = (regions ?? [])
    .filter((r) => r.kind === 'district' && !PRIORITY_REGIONS.includes(r.slug))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const depthValue = DEPTH_OPTIONS.findIndex(
    (o) => o.min === filters.minDepth && o.max === filters.maxDepth,
  );

  const body = (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zaman aralığı">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Zaman</span>
        {(['1h', '6h', '24h', '7d', '30d'] as TimeRange[]).map((r) => (
          <Chip key={r} active={filters.range === r} onClick={() => set({ range: r })}>
            {r === '1h' ? '1 saat' : r === '6h' ? '6 saat' : r === '24h' ? '24 saat' : r === '7d' ? '7 gün' : '30 gün'}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Minimum büyüklük">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Büyüklük</span>
        <Chip active={filters.minMagnitude === undefined} onClick={() => set({ minMagnitude: undefined })}>
          Tümü
        </Chip>
        {[1, 2, 3, 4, 5].map((m) => (
          <Chip key={m} active={filters.minMagnitude === m} onClick={() => set({ minMagnitude: m })}>
            M{m}+
          </Chip>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
        Derinlik
        <select
          value={depthValue === -1 ? 0 : depthValue}
          onChange={(e) => {
            const opt = DEPTH_OPTIONS[Number(e.target.value)]!;
            set({ minDepth: opt.min, maxDepth: opt.max });
          }}
          className="rounded-md border border-line bg-ink-800 px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-txt focus:border-accent/60 focus:outline-none"
        >
          {DEPTH_OPTIONS.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
        Kaynak
        <select
          value={filters.source ?? 'ALL'}
          onChange={(e) => set({ source: e.target.value === 'ALL' ? undefined : e.target.value })}
          className="rounded-md border border-line bg-ink-800 px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-txt focus:border-accent/60 focus:outline-none"
        >
          <option value="ALL">Tümü</option>
          <option value="AFAD">AFAD</option>
          <option value="KANDILLI">KANDİLLİ</option>
          {showMock && <option value="MOCK">MOCK (DEV)</option>}
        </select>
      </label>

      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
        Bölge
        <select
          value={filters.region ?? ''}
          onChange={(e) => set({ region: e.target.value || undefined })}
          className="max-w-[180px] rounded-md border border-line bg-ink-800 px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-txt focus:border-accent/60 focus:outline-none"
        >
          <option value="">Tüm bölge</option>
          {priority.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
          {others.length > 0 && (
            <optgroup label="Diğer ilçeler">
              {others.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
    </div>
  );

  return (
    <div className="rounded-lg border border-line bg-ink-800/70 p-3">
      <button
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-widest text-txt-soft lg:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Filtreler
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      <div className={clsx('lg:block', open ? 'mt-3 block' : 'hidden')}>{body}</div>
    </div>
  );
}
