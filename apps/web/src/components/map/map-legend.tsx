'use client';

import { RECENCY_RAMP } from '@ils/ui';
import { useMapStore } from '@/stores/map-store';

/** Map legend: recency colors + size = magnitude + reference layers. */
export function MapLegend({ className }: { className?: string }) {
  const heatmap = useMapStore((s) => s.heatmap);
  return (
    <div className={`rounded-lg border border-line bg-ink-800/90 p-3 text-[10px] shadow-panel backdrop-blur-md ${className ?? ''}`}>
      <p className="mb-1.5 font-bold uppercase tracking-widest text-txt-mute">Lejant</p>
      <div className="space-y-1">
        {RECENCY_RAMP.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-txt-soft">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: step.color }} />
            {step.label}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-end gap-1.5 text-txt-soft" aria-label="Boyut büyüklüğü gösterir">
        {[1, 2.5, 4, 5.5].map((m) => (
          <span key={m} className="flex flex-col items-center gap-0.5">
            <span
              aria-hidden
              className="rounded-full border border-ink-900 bg-txt-mute/70"
              style={{ width: 4 + m * 3.2, height: 4 + m * 3.2 }}
            />
            <span className="text-[8px] text-txt-mute">M{m}</span>
          </span>
        ))}
        <span className="ml-1 self-center text-txt-mute">boyut = büyüklük</span>
      </div>
      <div className="mt-2 space-y-1 border-t border-line pt-2 text-txt-soft">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: '#EF6A6A' }} />
          Fay segmenti (yaklaşık geometri)
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-0 w-5 border-t border-dashed border-txt-mute" />
          İstanbul sınırı (yaklaşık)
        </div>
        {heatmap && <p className="text-txt-mute">Isı haritası: gözlenen sismik yoğunluk (frekans) — bilimsel ölçüm değildir.</p>}
      </div>
    </div>
  );
}
