'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Card, CardHeader, DataClassBadge, EmptyState, MagnitudeBadge, Skeleton, SourceBadge } from '@ils/ui';
import { ChartCard, TimeMagScatter } from '@/components/charts';
import { EarthquakeTable } from '@/components/earthquake-table';
import { fmtCoord, fmtDate, fmtDepth, fmtKm, fmtMag, fmtTime } from '@/lib/format';
import { useEarthquake, useFaults, useNearby } from '@/lib/queries';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line/70 bg-ink-700/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-txt-mute">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-txt">{value}</p>
    </div>
  );
}

/** Mini map: this event + its nearest fault segment. */
function DetailMap({ lat, lon, faultSlug }: { lat: number; lon: number; faultSlug: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data: faults } = useFaults();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          sources: {
            carto: {
              type: 'raster',
              tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors © CARTO',
            },
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#060A12' } },
            { id: 'carto', type: 'raster', source: 'carto' },
          ],
        },
        center: [lon, lat],
        zoom: 9,
        interactive: true,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    // style.load: draw the event/fault layers immediately, without waiting for
    // basemap tiles (slow or blocked tile hosts must not hide the data).
    map.on('style.load', () => {
      if (map.getSource('event')) return;
      const fault = faults?.find((f) => f.slug === faultSlug);
      if (fault) {
        map.addSource('fault', {
          type: 'geojson',
          data: { type: 'Feature', geometry: fault.geometry as GeoJSON.Geometry, properties: {} },
        });
        map.addLayer({
          id: 'fault',
          type: 'line',
          source: 'fault',
          paint: { 'line-color': '#EF6A6A', 'line-width': 2, 'line-dasharray': [2, 1.5] },
        });
      }
      map.addSource('event', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} },
      });
      map.addLayer({
        id: 'event',
        type: 'circle',
        source: 'event',
        paint: {
          'circle-radius': 9,
          'circle-color': '#7DEBFF',
          'circle-stroke-color': '#060A12',
          'circle-stroke-width': 2,
        },
      });
    });
    return () => map.remove();
  }, [lat, lon, faultSlug, faults]);

  if (failed) return <EmptyState title="Harita servisi kullanılamıyor." className="h-full" />;
  return <div ref={ref} className="h-full w-full" role="img" aria-label="Deprem konumu haritası" />;
}

export function EarthquakeDetailClient({ id }: { id: string }) {
  const { data: event, isLoading, error } = useEarthquake(id);
  const { data: nearby, isLoading: nearbyLoading } = useNearby(event?.id);

  const nearbyScatter = useMemo(
    () =>
      (nearby ?? []).map((e) => ({ id: e.id, t: e.occurredAt, magnitude: e.magnitude, depthKm: e.depthKm })),
    [nearby],
  );

  if (error) {
    return (
      <EmptyState
        title="Deprem kaydı bulunamadı."
        hint="Kayıt kaldırılmış veya bağlantı hatalı olabilir."
        className="py-24"
      />
    );
  }
  if (isLoading || !event) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-80" />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MagnitudeBadge magnitude={event.magnitude} className="scale-125" />
        <h1 className="text-lg font-bold text-txt">{event.location}</h1>
        <DataClassBadge dataClass={event.dataClass} />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Magnitude" value={`${fmtMag(event.magnitude)} ${event.magnitudeType ?? ''}`} />
        <Field label="Depth" value={fmtDepth(event.depthKm)} />
        <Field label="Date" value={fmtDate(event.occurredAt)} />
        <Field label="Time" value={`${fmtTime(event.occurredAt)} (TSİ)`} />
        <Field
          label="Source"
          value={
            <span className="flex flex-wrap gap-1">
              {event.sources.map((s) => (
                <SourceBadge key={s.source + s.sourceEventId} source={s.source} />
              ))}
            </span>
          }
        />
        <Field label="Latitude" value={fmtCoord(event.latitude)} />
        <Field label="Longitude" value={fmtCoord(event.longitude)} />
        <Field label="Istanbul Distance" value={fmtKm(event.istanbulDistanceKm)} />
        <Field
          label="Nearest Fault"
          value={
            event.nearestFaultName ? (
              <Link href={`/faults?fault=${event.nearestFaultSlug}`} className="text-accent hover:underline">
                {event.nearestFaultName}
              </Link>
            ) : (
              '—'
            )
          }
        />
        <Field
          label="Distance to Fault"
          value={event.nearestFaultDistanceKm !== null ? fmtKm(event.nearestFaultDistanceKm) : '—'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-[340px] overflow-hidden">
          <DetailMap lat={event.latitude} lon={event.longitude} faultSlug={event.nearestFaultSlug} />
        </Card>
        <ChartCard
          title="Bölgedeki Yakın Tarihli Depremler"
          subtitle="30 km yarıçap · son 30 gün · zaman–büyüklük"
          loading={nearbyLoading}
          empty={nearbyScatter.length === 0}
          height={340}
          emptyMessage="Bu bölgede yakın tarihli başka kayıt yok."
        >
          <TimeMagScatter data={nearbyScatter} height={300} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="Yakındaki Kayıtlar" subtitle="30 km yarıçap içinde, son 30 gün" />
        <EarthquakeTable events={nearby?.slice(0, 20)} loading={nearbyLoading} compact />
      </Card>

      <Card className="p-4 text-[11px] leading-relaxed text-txt-mute">
        <p>
          Kaynak şeffaflığı: bu kayıt {event.sources.map((s) => s.source).join(' + ')} tarafından raporlanmıştır.
          Fay ilişkilendirmesi yalnızca geometrik en-yakın-segment hesabıdır ve sismolojik bir nedensellik iddiası
          taşımaz; fay geometrileri yaklaşıktır.
        </p>
      </Card>
    </div>
  );
}
