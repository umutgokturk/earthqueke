'use client';

import maplibregl, { Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Earthquake } from '@ils/types';
import { EmptyState, MAP_THEME, type MapThemeColors } from '@ils/ui';
import { ageHours } from '@/lib/format';
import { useEarthquakes, useFaults, useRegions } from '@/lib/queries';
import { useLiveStore } from '@/stores/live-store';
import { useLocationStore } from '@/stores/location-store';
import { useMapStore } from '@/stores/map-store';
import { useThemeStore } from '@/stores/theme-store';
import { MapControls } from './map-controls';
import { MapLegend } from './map-legend';
import { DistrictPanel, EarthquakePanel, FaultPanel } from './map-panels';

type Selection =
  | { kind: 'earthquake'; event: Earthquake }
  | { kind: 'fault'; slug: string }
  | { kind: 'district'; slug: string }
  | null;

function baseStyle(mt: MapThemeColors): StyleSpecification | string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (key) return `https://api.maptiler.com/maps/${mt.maptilerStyle}/style.json?key=${key}`;
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/${mt.rasterPath}/{z}/{x}/{y}@2x.png`,
          `https://b.basemaps.cartocdn.com/${mt.rasterPath}/{z}/{x}/{y}@2x.png`,
          `https://c.basemaps.cartocdn.com/${mt.rasterPath}/{z}/{x}/{y}@2x.png`,
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': mt.background } },
      { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-opacity': 0.9 } },
    ],
  };
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;

export function EarthquakeMap({
  className,
  showControls = true,
  showLegend = true,
  interactivePanels = true,
}: {
  className?: string;
  showControls?: boolean;
  showLegend?: boolean;
  interactivePanels?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  /** Harita nesli: her başarılı style.load'da artar — remount'ta veri etkileri kesin yeniden çalışır. */
  const [mapEpoch, setMapEpoch] = useState(0);
  const [mapError, setMapError] = useState(false);
  /** Basemap tiles failing — data layers still render; shown as a soft banner. */
  const [baseMapIssue, setBaseMapIssue] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const pulseFrame = useRef<number | null>(null);

  const theme = useThemeStore((s) => s.theme);
  const mt = MAP_THEME[theme];
  const layers = useMapStore();
  const latestEventId = useLiveStore((s) => s.latestEventId);
  const userCoords = useLocationStore((s) => s.coords);
  const locPending = useLocationStore((s) => s.pending);
  const requestLocation = useLocationStore((s) => s.request);
  const clearLocation = useLocationStore((s) => s.clear);
  const flyToUserNext = useRef(false);

  const { data: quakes } = useEarthquakes({ range: layers.window === '24h' ? '24h' : '7d', limit: 500 });
  const { data: faults } = useFaults();
  const { data: regions } = useRegions();

  const quakeGeojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const events = quakes?.items ?? [];
    return {
      type: 'FeatureCollection',
      features: events.map((e) => ({
        type: 'Feature',
        id: e.id,
        geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
        properties: {
          id: e.id,
          magnitude: e.magnitude,
          ageH: ageHours(e.occurredAt),
          weight: Math.max(0.2, e.magnitude / 5),
        },
      })),
    };
  }, [quakes]);

  const faultGeojson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: (faults ?? [])
        .filter((f) => !f.isZone)
        .map((f) => ({
          type: 'Feature',
          id: f.slug,
          geometry: f.geometry as GeoJSON.Geometry,
          properties: { slug: f.slug, name: f.name },
        })),
    };
  }, [faults]);

  const boundaryGeojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const istanbul = regions?.find((r) => r.slug === 'istanbul');
    if (!istanbul?.geometry) return EMPTY_FC;
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: istanbul.geometry as GeoJSON.Geometry, properties: {} }],
    };
  }, [regions]);

  const districtGeojson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: (regions ?? [])
        .filter((r) => r.kind === 'district')
        .map((r) => ({
          type: 'Feature',
          id: r.slug,
          geometry: { type: 'Point', coordinates: [r.centroid.longitude, r.centroid.latitude] },
          properties: { slug: r.slug, name: r.name },
        })),
    };
  }, [regions]);

  /** Bir noktada sönümlenen halka animasyonu (canlı olay + listeden seçim). */
  const runPulse = useCallback((map: MlMap, lngLat: [number, number]) => {
    const source = map.getSource('pulse') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (pulseFrame.current) cancelAnimationFrame(pulseFrame.current);
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: lngLat }, properties: {} }],
    });
    const start = performance.now();
    const animate = (now: number) => {
      const t = (now - start) / 1_500;
      if (t > 6 || !map.getLayer('pulse-ring')) {
        source.setData(EMPTY_FC);
        return;
      }
      const phase = t % 1;
      map.setPaintProperty('pulse-ring', 'circle-radius', 6 + phase * 34);
      map.setPaintProperty('pulse-ring', 'circle-stroke-opacity', 0.9 * (1 - phase));
      pulseFrame.current = requestAnimationFrame(animate);
    };
    pulseFrame.current = requestAnimationFrame(animate);
  }, []);

  // ── init (tema değişince yeni stil/renklerle yeniden kurulur) ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: baseStyle(mt),
        center: [28.85, 40.93],
        zoom: 8.1,
        minZoom: 6,
        maxZoom: 14,
        attributionControl: { compact: true },
      });
    } catch {
      setMapError(true);
      return;
    }
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __ilsMap?: MlMap }).__ilsMap = map; // dev debugging hook
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Basemap tile health: data layers never wait for raster tiles. If tiles
    // keep failing we show a soft banner; the first tile that arrives clears it.
    let tileErrors = 0;
    let tilesOk = false;
    map.on('error', (e) => {
      const sourceId = (e as { sourceId?: string }).sourceId;
      if (sourceId === 'carto' || (!sourceId && !tilesOk)) {
        tileErrors += 1;
        if (!tilesOk && tileErrors >= 3) setBaseMapIssue(true);
      }
    });
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'carto' && (e as { tile?: unknown }).tile && e.isSourceLoaded !== false) {
        tilesOk = true;
        setBaseMapIssue(false);
      }
    });

    // 'style.load' fires as soon as the style itself is ready (instant for the
    // inline raster style) — earthquake/fault layers appear immediately even
    // on a slow tile connection, instead of waiting for the full 'load'.
    map.on('style.load', () => {
      if (map.getSource('quakes')) return;
      map.addSource('quakes', { type: 'geojson', data: EMPTY_FC });
      map.addSource('faults', { type: 'geojson', data: EMPTY_FC });
      map.addSource('boundary', { type: 'geojson', data: EMPTY_FC });
      map.addSource('districts', { type: 'geojson', data: EMPTY_FC });
      map.addSource('pulse', { type: 'geojson', data: EMPTY_FC });
      map.addSource('me', { type: 'geojson', data: EMPTY_FC });
      // Symbol (text) layers get their own sources: glyph downloads can stall
      // a source's tiles, and labels must never block the line/point layers.
      map.addSource('faults-labels', { type: 'geojson', data: EMPTY_FC });
      map.addSource('districts-labels', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({
        id: 'heatmap',
        type: 'heatmap',
        source: 'quakes',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 1.1,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 18, 10, 34],
          'heatmap-opacity': 0.55,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            ...mt.heat.flatMap(([stop, color]) => [stop, color]),
          ],
        },
      });

      map.addLayer({
        id: 'boundary-line',
        type: 'line',
        source: 'boundary',
        paint: { 'line-color': mt.boundary, 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': 0.8 },
      });

      map.addLayer({
        id: 'fault-casing',
        type: 'line',
        source: 'faults',
        paint: { 'line-color': mt.casing, 'line-width': 4, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: 'fault-line',
        type: 'line',
        source: 'faults',
        paint: { 'line-color': mt.faultLine, 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
      map.addLayer({
        id: 'fault-label',
        type: 'symbol',
        source: 'faults-labels',
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
        },
        paint: { 'text-color': mt.faultLabel, 'text-halo-color': mt.labelHalo, 'text-halo-width': 1.2 },
      });

      map.addLayer({
        id: 'district-dot',
        type: 'circle',
        source: 'districts',
        paint: {
          'circle-radius': 3,
          'circle-color': mt.districtDot,
          'circle-opacity': 0.55,
          'circle-stroke-color': mt.casing,
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'district-label',
        type: 'symbol',
        source: 'districts-labels',
        minzoom: 8.6,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
        },
        paint: { 'text-color': mt.districtLabel, 'text-halo-color': mt.labelHalo, 'text-halo-width': 1.1 },
      });

      map.addLayer({
        id: 'pulse-ring',
        type: 'circle',
        source: 'pulse',
        paint: {
          'circle-radius': 8,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': mt.pulse,
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.9,
        },
      });

      // markers: radius = magnitude, color = recency (validated ordinal ramp)
      map.addLayer({
        id: 'quake-dot',
        type: 'circle',
        source: 'quakes',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'magnitude'],
            0, 2.5,
            2, 4.5,
            3, 7.5,
            4, 12,
            5, 18,
            6, 26,
          ],
          'circle-color': [
            'step',
            ['get', 'ageH'],
            mt.recencySteps[0]![1],
            mt.recencySteps[0]![0], mt.recencySteps[1]![1],
            mt.recencySteps[1]![0], mt.recencySteps[2]![1],
            mt.recencySteps[2]![0], mt.recencyOld,
          ],
          'circle-opacity': 0.82,
          'circle-stroke-color': mt.casing,
          'circle-stroke-width': 1,
        },
      });

      // kullanıcı konumu — yalnızca tarayıcıda tutulur
      map.addLayer({
        id: 'me-ring',
        type: 'circle',
        source: 'me',
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': mt.userMarker,
          'circle-stroke-width': 1.6,
          'circle-stroke-opacity': 0.55,
        },
      });
      map.addLayer({
        id: 'me-dot',
        type: 'circle',
        source: 'me',
        paint: {
          'circle-radius': 5,
          'circle-color': mt.userMarker,
          'circle-stroke-color': mt.casing,
          'circle-stroke-width': 2,
        },
      });

      if (interactivePanels) {
        const clickable = ['quake-dot', 'district-dot', 'fault-line'] as const;
        for (const layerId of clickable) {
          map.on('mouseenter', layerId, () => (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', layerId, () => (map.getCanvas().style.cursor = ''));
        }
        map.on('click', (e) => {
          const features = map.queryRenderedFeatures(
            [
              [e.point.x - 6, e.point.y - 6],
              [e.point.x + 6, e.point.y + 6],
            ],
            { layers: [...clickable] },
          );
          const feature = features[0];
          if (!feature) {
            setSelection(null);
            return;
          }
          if (feature.layer.id === 'quake-dot') {
            const id = String(feature.properties?.id ?? '');
            window.dispatchEvent(new CustomEvent('ils:select-quake', { detail: id }));
          } else if (feature.layer.id === 'district-dot') {
            setSelection({ kind: 'district', slug: String(feature.properties?.slug ?? '') });
          } else {
            setSelection({ kind: 'fault', slug: String(feature.properties?.slug ?? '') });
          }
        });
      }

      setMapEpoch((v) => v + 1);
    });

    return () => {
      if (pulseFrame.current) cancelAnimationFrame(pulseFrame.current);
      map.remove();
      mapRef.current = null;
      setBaseMapIssue(false);
    };
    // re-runs on manual retry and on theme change (new style + colors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken, theme]);

  // resolve quake clicks against loaded data (custom event keeps the map handler stable)
  useEffect(() => {
    if (!interactivePanels) return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const event = quakes?.items.find((q) => q.id === id);
      if (event) setSelection({ kind: 'earthquake', event });
    };
    window.addEventListener('ils:select-quake', handler);
    return () => window.removeEventListener('ils:select-quake', handler);
  }, [quakes, interactivePanels]);

  // ── data updates ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;
    (map.getSource('quakes') as maplibregl.GeoJSONSource | undefined)?.setData(quakeGeojson);
  }, [quakeGeojson, mapEpoch]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;
    (map.getSource('faults') as maplibregl.GeoJSONSource | undefined)?.setData(faultGeojson);
    (map.getSource('faults-labels') as maplibregl.GeoJSONSource | undefined)?.setData(faultGeojson);
  }, [faultGeojson, mapEpoch]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;
    (map.getSource('boundary') as maplibregl.GeoJSONSource | undefined)?.setData(boundaryGeojson);
    (map.getSource('districts') as maplibregl.GeoJSONSource | undefined)?.setData(districtGeojson);
    (map.getSource('districts-labels') as maplibregl.GeoJSONSource | undefined)?.setData(districtGeojson);
  }, [boundaryGeojson, districtGeojson, mapEpoch]);

  // ── kullanıcı konumu katmanı ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;
    const source = map.getSource('me') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (!userCoords) {
      source.setData(EMPTY_FC);
      return;
    }
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [userCoords.longitude, userCoords.latitude] },
          properties: {},
        },
      ],
    });
    if (flyToUserNext.current) {
      flyToUserNext.current = false;
      map.flyTo({ center: [userCoords.longitude, userCoords.latitude], zoom: Math.max(map.getZoom(), 9), duration: 1200 });
    }
  }, [userCoords, mapEpoch]);

  // ── layer visibility ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;
    const vis = (visible: boolean) => (visible ? 'visible' : 'none');
    const safeSet = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', vis(visible));
    };
    safeSet('quake-dot', layers.earthquakes);
    safeSet('pulse-ring', layers.earthquakes);
    safeSet('fault-line', layers.faults);
    safeSet('fault-casing', layers.faults);
    safeSet('fault-label', layers.faults);
    safeSet('boundary-line', layers.istanbulBoundary);
    safeSet('district-dot', layers.districts);
    safeSet('district-label', layers.districts);
    safeSet('heatmap', layers.heatmap);
  }, [layers.earthquakes, layers.faults, layers.istanbulBoundary, layers.districts, layers.heatmap, mapEpoch]);

  // ── live pulse on the newest event ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0 || !latestEventId) return;
    const event = quakes?.items.find((q) => q.id === latestEventId);
    if (!event) return;
    runPulse(map, [event.longitude, event.latitude]);
    return () => {
      if (pulseFrame.current) cancelAnimationFrame(pulseFrame.current);
    };
  }, [latestEventId, mapEpoch, quakes, runPulse]);

  // ── listeden seçilen olaya uç + vurgula ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0 || !layers.focus) return;
    const event = quakes?.items.find((q) => q.id === layers.focus!.id);
    if (!event) return;
    map.flyTo({
      center: [event.longitude, event.latitude],
      zoom: Math.max(map.getZoom(), 9.5),
      duration: 1100,
    });
    runPulse(map, [event.longitude, event.latitude]);
    if (interactivePanels) setSelection({ kind: 'earthquake', event });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.focus, mapEpoch]);

  if (mapError) {
    return (
      <div className={`relative overflow-hidden rounded-lg border border-line bg-ink-800 ${className ?? ''}`}>
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center">
          <EmptyState
            title="Harita servisi kullanılamıyor."
            hint="Harita başlatılamadı (WebGL desteği gerekli). Deprem verileri tablo ve grafiklerden izlenebilir."
            icon="🗺"
          />
          <button
            onClick={() => {
              setMapError(false);
              setRetryToken((t) => t + 1);
            }}
            className="rounded-md border border-accent/50 bg-accent-soft px-4 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            Yeniden dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-line ${className ?? ''}`}>
      <div ref={containerRef} className="h-full w-full" role="application" aria-label="Deprem haritası" />
      {mapEpoch === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-800/70 backdrop-blur-sm">
          <p className="text-xs text-txt-mute">Harita yükleniyor…</p>
        </div>
      )}
      {baseMapIssue && (
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-status-warn/50 bg-ink-800/95 px-3 py-1.5 text-[11px] text-status-warn shadow-panel">
          Harita altlığı yüklenemedi — deprem katmanları yine de gösteriliyor.
          <button
            onClick={() => {
              setBaseMapIssue(false);
              setRetryToken((t) => t + 1);
            }}
            className="rounded border border-status-warn/50 px-2 py-0.5 font-semibold hover:bg-status-warn/10"
          >
            Yeniden dene
          </button>
        </div>
      )}
      {/* Konumum — istek üzerine; konum yalnızca bu tarayıcıda tutulur */}
      <div className="absolute bottom-8 left-3 z-10 flex items-center gap-1.5">
        <button
          onClick={() => {
            if (userCoords) {
              flyToUserNext.current = true;
              // koordinat aynı kalsa da flyTo çalışsın
              const map = mapRef.current;
              if (map) map.flyTo({ center: [userCoords.longitude, userCoords.latitude], zoom: Math.max(map.getZoom(), 9), duration: 1200 });
            } else {
              flyToUserNext.current = true;
              requestLocation();
            }
          }}
          className="flex items-center gap-1.5 rounded-full border border-line bg-ink-800/90 px-3 py-1.5 text-[11px] font-semibold text-txt-soft shadow-panel backdrop-blur-sm transition-colors hover:text-txt"
          title="Konumunu haritada göster — konum yalnızca tarayıcında tutulur, sunucuya gönderilmez"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="2.4" fill="currentColor" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {locPending ? 'Konum alınıyor…' : userCoords ? 'Konumum' : 'Konumumu göster'}
        </button>
        {userCoords && (
          <button
            onClick={clearLocation}
            aria-label="Konumu kaldır"
            title="Konumu kaldır"
            className="rounded-full border border-line bg-ink-800/90 p-1.5 text-txt-mute shadow-panel backdrop-blur-sm transition-colors hover:text-txt"
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {showControls && (
        <div className="absolute left-3 top-3 hidden sm:block">
          <MapControls />
        </div>
      )}
      {showLegend && (
        <div className="absolute bottom-8 right-3 hidden md:block">
          <MapLegend />
        </div>
      )}
      {selection && (
        <div className="absolute right-3 top-3 z-10">
          {selection.kind === 'earthquake' && (
            <EarthquakePanel event={selection.event} onClose={() => setSelection(null)} />
          )}
          {selection.kind === 'fault' && <FaultPanel slug={selection.slug} onClose={() => setSelection(null)} />}
          {selection.kind === 'district' && (
            <DistrictPanel slug={selection.slug} onClose={() => setSelection(null)} />
          )}
        </div>
      )}
    </div>
  );
}
