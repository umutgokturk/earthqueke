'use client';

import { clsx } from 'clsx';
import { useMapStore, type MapLayerState } from '@/stores/map-store';

const LAYERS: Array<{ key: keyof Omit<MapLayerState, 'window'>; label: string }> = [
  { key: 'earthquakes', label: 'Depremler' },
  { key: 'faults', label: 'Faylar' },
  { key: 'istanbulBoundary', label: 'İstanbul sınırı' },
  { key: 'districts', label: 'İlçeler' },
  { key: 'heatmap', label: 'Isı haritası' },
];

export function MapControls({ className }: { className?: string }) {
  const state = useMapStore();
  return (
    <div
      className={clsx(
        'rounded-lg border border-line bg-ink-800/90 p-3 text-xs shadow-panel backdrop-blur-md',
        className,
      )}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Katmanlar</p>
      <div className="space-y-1.5">
        {LAYERS.map((layer) => (
          <label key={layer.key} className="flex cursor-pointer items-center gap-2 text-txt-soft hover:text-txt">
            <input
              type="checkbox"
              checked={state[layer.key]}
              onChange={() => state.toggle(layer.key)}
              className="h-3.5 w-3.5 accent-[#22D3EE]"
            />
            {layer.label}
          </label>
        ))}
      </div>
      <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-widest text-txt-mute">Zaman penceresi</p>
      <div className="flex gap-1">
        {(['24h', '7d'] as const).map((w) => (
          <button
            key={w}
            onClick={() => state.setWindow(w)}
            aria-pressed={state.window === w}
            className={clsx(
              'flex-1 rounded border px-2 py-1 text-[11px] font-semibold',
              state.window === w
                ? 'border-accent/60 bg-accent-soft text-accent'
                : 'border-line text-txt-soft hover:bg-ink-700',
            )}
          >
            {w === '24h' ? 'Son 24 saat' : 'Son 7 gün'}
          </button>
        ))}
      </div>
    </div>
  );
}
