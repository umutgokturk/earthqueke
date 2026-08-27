'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MagnitudeBadge } from '@ils/ui';
import { fmtShort } from '@/lib/format';
import { useSearch } from '@/lib/queries';

/** Global search (spec §33): earthquakes, locations, districts, faults. */
export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useSearch(q);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const hasResults =
    data && (data.earthquakes.length > 0 || data.faults.length > 0 || data.regions.length > 0);

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Ara: konum, ilçe, fay, ID…"
        aria-label="Global arama"
        className="w-52 rounded-md border border-line bg-ink-800 px-3 py-1.5 text-xs text-txt placeholder:text-txt-mute focus:border-accent/60 focus:outline-none"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-96 w-80 overflow-auto rounded-lg border border-line bg-ink-700 p-2 shadow-panel">
          {isFetching && !data ? (
            <p className="px-2 py-3 text-xs text-txt-mute">Aranıyor…</p>
          ) : !hasResults ? (
            <p className="px-2 py-3 text-xs text-txt-mute">Sonuç bulunamadı.</p>
          ) : (
            <>
              {data!.earthquakes.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Depremler</p>
                  {data!.earthquakes.slice(0, 5).map((e) => (
                    <Link
                      key={e.id}
                      href={`/earthquakes/${e.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-ink-600"
                    >
                      <MagnitudeBadge magnitude={e.magnitude} />
                      <span className="min-w-0 flex-1 truncate text-xs text-txt-soft">{e.location}</span>
                      <span className="text-[10px] text-txt-mute">{fmtShort(e.occurredAt)}</span>
                    </Link>
                  ))}
                </div>
              )}
              {data!.faults.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Faylar</p>
                  {data!.faults.map((f) => (
                    <Link
                      key={f.id}
                      href={`/faults?fault=${f.slug}`}
                      onClick={() => setOpen(false)}
                      className="block rounded px-2 py-1.5 text-xs text-txt-soft hover:bg-ink-600"
                    >
                      {f.name} <span className="text-txt-mute">· {f.segmentType}</span>
                    </Link>
                  ))}
                </div>
              )}
              {data!.regions.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Bölgeler</p>
                  {data!.regions.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/earthquakes?region=${r.slug}`}
                      onClick={() => setOpen(false)}
                      className="block rounded px-2 py-1.5 text-xs text-txt-soft hover:bg-ink-600"
                    >
                      {r.name} <span className="text-txt-mute">· {r.kind === 'district' ? 'ilçe' : r.kind}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
