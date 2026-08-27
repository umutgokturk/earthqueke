'use client';

import { EarthquakeMap } from '@/components/map/earthquake-map';
import { MapControls } from '@/components/map/map-controls';
import { MapLegend } from '@/components/map/map-legend';

export function MapClient() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">CANLI HARİTA</h1>
        <p className="text-[11px] text-txt-mute">
          Marker boyutu büyüklüğü, renk son gözlem zamanını gösterir · Fay geometrileri yaklaşıktır
        </p>
      </div>
      <EarthquakeMap className="h-[calc(100vh-180px)] min-h-[420px]" />
      {/* mobile: controls & legend below the map */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        <MapControls />
        <MapLegend />
      </div>
    </div>
  );
}
