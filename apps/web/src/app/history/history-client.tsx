'use client';

import { useState } from 'react';
import { Card, CardHeader } from '@ils/ui';
import { EarthquakeTable } from '@/components/earthquake-table';
import { qs } from '@/lib/api';
import { useEarthquakes, useRegions } from '@/lib/queries';

function isoStart(d: string): string | undefined {
  return d ? new Date(`${d}T00:00:00+03:00`).toISOString() : undefined;
}
function isoEnd(d: string): string | undefined {
  return d ? new Date(`${d}T23:59:59+03:00`).toISOString() : undefined;
}

const inputCls =
  'rounded-md border border-line bg-ink-800 px-2 py-1.5 text-xs text-txt focus:border-accent/60 focus:outline-none';

export function HistoryClient() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [minMag, setMinMag] = useState('');
  const [maxMag, setMaxMag] = useState('');
  const [region, setRegion] = useState('');
  const [page, setPage] = useState(1);

  const { data: regions } = useRegions();
  const filters = {
    from: isoStart(start),
    to: isoEnd(end),
    minMagnitude: minMag ? Number(minMag) : undefined,
    maxMagnitude: maxMag ? Number(maxMag) : undefined,
    region: region || undefined,
    limit: 50,
    offset: (page - 1) * 50,
  };
  const { data, isLoading } = useEarthquakes(filters);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  const exportUrl = `/api/earthquakes/export${qs({
    from: filters.from,
    to: filters.to,
    minMagnitude: filters.minMagnitude,
    maxMagnitude: filters.maxMagnitude,
    region: filters.region,
  })}`;

  const districts = (regions ?? []).filter((r) => r.kind === 'district');

  return (
    <div className="space-y-3">
      <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">GEÇMİŞ VERİLER</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-ink-800/70 p-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
          Başlangıç
          <input type="date" value={start} max={end} onChange={(e) => { setStart(e.target.value); setPage(1); }} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
          Bitiş
          <input type="date" value={end} min={start} max={today} onChange={(e) => { setEnd(e.target.value); setPage(1); }} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
          Min Büyüklük
          <input type="number" step="0.1" min="0" max="10" value={minMag} placeholder="örn. 2" onChange={(e) => { setMinMag(e.target.value); setPage(1); }} className={`${inputCls} w-24`} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
          Maks Büyüklük
          <input type="number" step="0.1" min="0" max="10" value={maxMag} placeholder="örn. 5" onChange={(e) => { setMaxMag(e.target.value); setPage(1); }} className={`${inputCls} w-24`} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">
          Bölge
          <select value={region} onChange={(e) => { setRegion(e.target.value); setPage(1); }} className={inputCls}>
            <option value="">Tümü</option>
            <option value="istanbul">İstanbul</option>
            <option value="marmara">Marmara Denizi</option>
            <optgroup label="İlçeler">
              {districts.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <a
          href={exportUrl}
          download
          className="ml-auto rounded-md border border-accent/50 bg-accent-soft px-4 py-2 text-xs font-bold text-accent hover:bg-accent/20"
        >
          ⬇ Export CSV
        </a>
      </div>

      <Card>
        <CardHeader title={`Kayıtlar${data ? ` · ${data.total}` : ''}`} subtitle="Tarihler Europe/Istanbul saat diliminde yorumlanır" />
        <EarthquakeTable events={data?.items} loading={isLoading} />
        {data && data.total > 50 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-txt-soft">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-line px-3 py-1 font-semibold disabled:opacity-40">
              ← Önceki
            </button>
            <span className="tabular-nums">Sayfa {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-line px-3 py-1 font-semibold disabled:opacity-40">
              Sonraki →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
